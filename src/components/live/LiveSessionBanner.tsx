import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAdminUpcomingLiveSessions,
  useLiveSessionsRealtime,
  useStudentUpcomingLiveSessions,
} from "@/hooks/use-live-sessions";
import { countdown } from "@/lib/cairo-time";
import type { LiveSessionStatus } from "@/lib/live-sessions-api";

const BANNER_HEIGHT = "44px";
/** A session shows in the banner from 30 min before it starts until its window ends. */
const SOON_MS = 30 * 60_000;
const OVERRUN_MS = 120 * 60_000;

interface BannerSession {
  id: string;
  course_id: string;
  course_title: string;
  title: string;
  scheduled_start_at: string;
  duration_minutes: number;
  status: LiveSessionStatus;
  link_version: number;
}

export function useActiveLiveBannerSession(): BannerSession | null {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const student = useStudentUpcomingLiveSessions();
  const admin = useAdminUpcomingLiveSessions();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const source = isAdmin ? admin.data : student.data;

  return useMemo(() => {
    if (!user || !source?.length) return null;
    const candidates = (source as unknown as (BannerSession & { host_user_id?: string })[]).filter(
      (s) => {
        if (isAdmin && s.host_user_id !== user.id) return false;
        if (s.status === "live") return true;
        if (s.status !== "scheduled") return false;
        const start = new Date(s.scheduled_start_at).getTime();
        return now >= start - SOON_MS && now <= start + s.duration_minutes * 60_000 + OVERRUN_MS;
      },
    );
    if (!candidates.length) return null;
    // Live first, then the soonest start.
    candidates.sort((a, b) => {
      if (a.status !== b.status) return a.status === "live" ? -1 : 1;
      return new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime();
    });
    return candidates[0];
  }, [source, user, isAdmin, now]);
}

/**
 * Global top banner. Mounted once under AuthProvider; publishes its height to
 * `--live-banner-h` so sticky headers/sidebars can sit below it.
 */
const LiveSessionBanner = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const session = useActiveLiveBannerSession();
  useLiveSessionsRealtime();

  const isAdmin = profile?.role === "admin";
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session?.id]);

  const storageKey = session ? `live-banner-dismissed:${session.id}:${session.link_version}` : null;
  const dismissed =
    Boolean(storageKey) &&
    (dismissedKey === storageKey || sessionStorage.getItem(storageKey!) === "1");
  const visible = Boolean(session) && Boolean(user) && !dismissed;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--live-banner-h", visible ? BANNER_HEIGHT : "0px");
    return () => root.style.setProperty("--live-banner-h", "0px");
  }, [visible]);

  if (!session) return null;

  const isLive = session.status === "live";
  const cd = countdown(session.scheduled_start_at, now);
  const mmss = `${String(cd.minutes + cd.hours * 60).padStart(2, "0")}:${String(cd.seconds).padStart(2, "0")}`;

  const text = isLive
    ? isAdmin
      ? `مباشر الآن: «${session.title}»`
      : `مباشر الآن: «${session.title}» — ${session.course_title}`
    : isAdmin
      ? `جلستك «${session.title}» تبدأ خلال ${mmss}`
      : `تبدأ جلسة «${session.title}» خلال ${mmss}`;

  const cta = isLive ? (isAdmin ? "فتح الجلسة" : "انضم الآن") : isAdmin ? "فتح الجلسة" : "التفاصيل";

  const target = isAdmin
    ? `/admin/courses/${session.course_id}/builder`
    : `/courses/${session.course_id}/learn/live_session/${session.id}`;

  const dismiss = () => {
    if (storageKey) sessionStorage.setItem(storageKey, "1");
    setDismissedKey(storageKey);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduceMotion ? undefined : { y: -44, opacity: 0 }}
          animate={reduceMotion ? undefined : { y: 0, opacity: 1 }}
          exit={reduceMotion ? undefined : { y: -44, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`fixed top-0 inset-x-0 z-[60] h-11 flex items-center justify-center gap-3 px-4 text-sm font-medium ${
            isLive ? "bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground"
          }`}
          role="status"
          dir="rtl"
        >
          {isLive ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-current animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
          ) : (
            <Clock className="h-4 w-4 shrink-0" />
          )}

          <span className="truncate max-w-[45vw] sm:max-w-none">{text}</span>

          <Button
            size="sm"
            variant="secondary"
            className="h-7 shrink-0"
            onClick={() => navigate(target)}
          >
            {cta}
          </Button>

          <button
            type="button"
            onClick={dismiss}
            aria-label="إخفاء"
            className="shrink-0 rounded-md p-1 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LiveSessionBanner;
