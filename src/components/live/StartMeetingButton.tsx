import { useEffect, useState } from "react";
import { AlertDialog, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { ExternalLink, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLiveSessionState } from "@/hooks/use-live-sessions";
import { countdown, serverNow, serverOffsetMs } from "@/lib/cairo-time";
import { openExternalAfter } from "@/lib/open-external";
import {
  endLiveSession,
  liveErrorMessage,
  LiveSessionError,
  startLiveSession,
  type LiveSessionRow,
} from "@/lib/live-sessions-api";
import ReplaceLinkDialog from "./ReplaceLinkDialog";

interface Props {
  session: LiveSessionRow;
  onChanged: () => void;
}

/**
 * Host controls: start (allowed from T-10 min), replace the link, end.
 * Every window check uses the server clock from `get_live_session_state`.
 */
const StartMeetingButton = ({ session, onChanged }: Props) => {
  const { data } = useLiveSessionState(session.id);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!data) {
    return (
      <Button size="sm" variant="outline" disabled>
        ابدأ الجلسة
      </Button>
    );
  }

  const serverNowMs = serverNow(serverOffsetMs(data.server_now));
  const startMs = new Date(data.scheduled_start_at).getTime();
  const opensAt = startMs - 10 * 60_000;
  const cd = countdown(opensAt, serverNowMs);
  const canStart = serverNowMs >= opensAt && data.status === "scheduled";
  const soon = canStart && serverNowMs >= startMs - 2 * 60_000;
  const isLive = data.status === "live";

  const start = async () => {
    setBusy(true);
    try {
      const result = await openExternalAfter(async () => (await startLiveSession(session.id)).start_url);
      if (result.blocked && result.url) window.location.href = result.url;
      onChanged();
    } catch (e) {
      const msg = e instanceof LiveSessionError ? liveErrorMessage(e.message) : liveErrorMessage(null);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const openHostTab = async () => {
    setBusy(true);
    try {
      await openExternalAfter(async () => (await startLiveSession(session.id)).start_url);
      onChanged();
    } catch {
      toast.error("تعذّر فتح Zoom");
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    setBusy(true);
    try {
      await endLiveSession(session.id);
      toast.success("تم إنهاء الجلسة");
      onChanged();
    } catch {
      toast.error(liveErrorMessage("SESSION_NOT_LIVE"));
    } finally {
      setBusy(false);
      setEndOpen(false);
    }
  };

  if (isLive) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setReplaceOpen(true)} disabled={busy}>
            <RefreshCw className="h-4 w-4" /> تحديث / استبدال رابط الاجتماع
          </Button>
          <Button size="sm" variant="ghost" onClick={openHostTab} disabled={busy}>
            <ExternalLink className="h-4 w-4" /> فتح Zoom كمضيف
          </Button>
        </div>
        {data.segment_count > 1 && (
          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            الجزء {data.segment_count}
          </span>
        )}
        <div>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setEndOpen(true)}
            disabled={busy}
          >
            إنهاء الجلسة
          </Button>
        </div>

        <ReplaceLinkDialog
          sessionId={session.id}
          open={replaceOpen}
          onOpenChange={setReplaceOpen}
          onDone={onChanged}
        />

        <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>إنهاء الجلسة؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم إغلاق الجلسة للطلاب وبدء تجهيز التسجيلات.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault();
                  void end();
                }}
                disabled={busy}
              >
                إنهاء الجلسة
              </AlertDialogAction>
              <AlertDialogCancel>تراجع</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (!canStart) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button size="sm" variant="outline" disabled>
              <Play className="h-4 w-4" /> ابدأ الجلسة
            </Button>
            <span className="ms-2 text-xs text-muted-foreground tabular-nums">
              بعد {cd.days > 0 ? `${cd.days} ي ` : ""}
              {String(cd.hours).padStart(2, "0")}:{String(cd.minutes).padStart(2, "0")}:
              {String(cd.seconds).padStart(2, "0")}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent>يتاح قبل الموعد بـ 10 دقائق</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      size="sm"
      onClick={start}
      disabled={busy}
      className={soon ? "ring-2 ring-primary/40 animate-pulse" : ""}
    >
      <Play className="h-4 w-4" /> ابدأ الجلسة
    </Button>
  );
};

export default StartMeetingButton;
