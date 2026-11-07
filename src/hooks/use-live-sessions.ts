import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  getLiveSessionState,
  listAdminUpcoming,
  listStudentUpcoming,
  type AdminUpcomingLiveSession,
  type LiveSessionState,
  type UpcomingLiveSession,
} from "@/lib/live-sessions-api";

/** Every live-session query key starts with this prefix so one channel can invalidate all. */
export const LIVE_SESSIONS_KEY = "live-sessions";

const REFETCH_MS = 60_000;

export function useLiveSessionState(sessionId: string | undefined) {
  return useQuery<LiveSessionState>({
    queryKey: [LIVE_SESSIONS_KEY, "state", sessionId],
    queryFn: () => getLiveSessionState(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: REFETCH_MS,
    retry: false,
  });
}

function windowBounds(fromHoursAgo: number, toHoursAhead: number) {
  const now = Date.now();
  return {
    from: new Date(now - fromHoursAgo * 3_600_000).toISOString(),
    to: new Date(now + toHoursAhead * 3_600_000).toISOString(),
  };
}

/** Upcoming sessions for the logged-in student (7-day horizon). */
export function useStudentUpcomingLiveSessions(enabled = true) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { from, to } = windowBounds(8, 24 * 7);
  return useQuery<UpcomingLiveSession[]>({
    queryKey: [LIVE_SESSIONS_KEY, "student-upcoming", from, to],
    queryFn: () => listStudentUpcoming(from, to),
    enabled: enabled && !isAdmin,
    refetchInterval: REFETCH_MS,
    retry: false,
  });
}

/** Upcoming sessions across all courses (admins only). */
export function useAdminUpcomingLiveSessions(enabled = true) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { from, to } = windowBounds(8, 24 * 7);
  return useQuery<AdminUpcomingLiveSession[]>({
    queryKey: [LIVE_SESSIONS_KEY, "admin-upcoming", from, to],
    queryFn: () => listAdminUpcoming(from, to),
    enabled: enabled && isAdmin,
    refetchInterval: REFETCH_MS,
    retry: false,
  });
}

/**
 * One global realtime channel on public.live_sessions. Mounted once (App-level
 * banner); any row change invalidates every live-session query. Lifecycle copied
 * from use-cart.ts: remove the channel on unmount, no leaks across HMR.
 */
export function useLiveSessionsRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!enabled || !user) return;
    const topic = `live-sessions-${user.id}-${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Date.now()
    }`;

    const channel = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions" }, () => {
        void queryClient.invalidateQueries({ queryKey: [LIVE_SESSIONS_KEY] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, user, queryClient]);
}
