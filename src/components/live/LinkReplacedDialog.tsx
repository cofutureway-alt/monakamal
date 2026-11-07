import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveSessionsRealtime, useStudentUpcomingLiveSessions } from "@/hooks/use-live-sessions";
import {
  getLiveSessionJoin,
  getLiveSessionState,
  liveErrorMessage,
  LiveSessionError,
} from "@/lib/live-sessions-api";
import { openExternalAfter } from "@/lib/open-external";

/**
 * Watches `link_version` on the student's upcoming sessions. When a session the
 * student is currently in (or whose page they are on) gets a new link, a modal
 * offers an instant rejoin.
 *
 * Versions are seeded on the first payload so navigating never triggers it.
 */
const LinkReplacedDialog = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const location = useLocation();
  const { data } = useStudentUpcomingLiveSessions();
  useLiveSessionsRealtime();

  const seen = useRef<Map<string, number> | null>(null);
  const [prompt, setPrompt] = useState<{ sessionId: string; courseId: string; title: string } | null>(
    null,
  );
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (isAdmin || !data) return;

    // First load: remember what is already there and stay quiet.
    if (seen.current === null) {
      seen.current = new Map(data.map((s) => [s.id, s.link_version]));
      return;
    }

    const bumped: typeof data = [];
    for (const s of data) {
      const previous = seen.current.get(s.id);
      seen.current.set(s.id, s.link_version);
      if (previous === undefined || s.link_version <= previous) continue;
      bumped.push(s);
    }
    if (!bumped.length) return;

    // G5: only students who actually joined this session (server-side
    // attendance) or who are looking at its page get the blocking dialog.
    // Everyone else just has the in-app notification.
    let cancelled = false;
    void (async () => {
      for (const s of bumped) {
        const onThisPage = location.pathname.includes(`/learn/live_session/${s.id}`);
        let joined = false;
        if (!onThisPage) {
          try {
            joined = (await getLiveSessionState(s.id)).i_joined;
          } catch {
            joined = false;
          }
        }
        if (cancelled) return;
        if (onThisPage || joined) {
          setPrompt({ sessionId: s.id, courseId: s.course_id, title: s.title });
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, isAdmin, location.pathname]);

  const rejoin = async () => {
    if (!prompt) return;
    setJoining(true);
    try {
      await openExternalAfter(async () => (await getLiveSessionJoin(prompt.sessionId)).join_url);
      setPrompt(null);
    } catch (e) {
      const code = e instanceof LiveSessionError ? e.code : "UNKNOWN";
      toast.error(liveErrorMessage(code));
    } finally {
      setJoining(false);
    }
  };

  return (
    <AlertDialog open={Boolean(prompt)} onOpenChange={(v) => !v && setPrompt(null)}>
      <AlertDialogContent dir="rtl">
        <div className="mx-auto mb-2 w-fit rounded-full bg-destructive/15 text-destructive p-3">
          <RefreshCw className="h-5 w-5" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>تم تحديث رابط البث</AlertDialogTitle>
          <AlertDialogDescription>
            انقطع الاجتماع السابق. اضغط للانضمام بالرابط الجديد.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void rejoin();
            }}
            disabled={joining}
          >
            انضم مجدداً
          </AlertDialogAction>
          <AlertDialogCancel>لاحقاً</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LinkReplacedDialog;
