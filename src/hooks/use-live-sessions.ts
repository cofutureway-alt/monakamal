import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
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

/**
 * Stable query keys. The window bounds must NOT live in the key: the banner
 * re-renders every second and would create a fresh query (and RPC) each time.
 * Bounds are computed inside `queryFn` instead.
 */
export function liveUpcomingKey(kind: "student" | "admin") {
  return [LIVE_SESSIONS_KEY, `${kind}-upcoming`] as const;
}

export function liveSessionStateKey(sessionId: string | undefined) {
  return [LIVE_SESSIONS_KEY, "state", sessionId] as const;
}

function windowBounds(fromHoursAgo: number, toHoursAhead: number) {
  const now = Date.now();
  return {
    from: new Date(now - fromHoursAgo * 3_600_000).toISOString(),
    to: new Date(now + toHoursAhead * 3_600_000).toISOString(),
  };
}

export function useLiveSessionState(sessionId: string | undefined, refetchMs = REFETCH_MS) {
  return useQuery<LiveSessionState>({
    queryKey: liveSessionStateKey(sessionId),
    queryFn: () => getLiveSessionState(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: refetchMs,
    retry: false,
  });
}

/** Upcoming sessions for the logged-in student (7-day horizon). */
export function useStudentUpcomingLiveSessions(enabled = true) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  return useQuery<UpcomingLiveSession[]>({
    queryKey: liveUpcomingKey("student"),
    queryFn: () => {
      const { from, to } = windowBounds(8, 24 * 7);
      return listStudentUpcoming(from, to);
    },
    enabled: enabled && !isAdmin,
    refetchInterval: REFETCH_MS,
    retry: false,
  });
}

/** Upcoming sessions across all courses (admins only). */
export function useAdminUpcomingLiveSessions(enabled = true) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  return useQuery<AdminUpcomingLiveSession[]>({
    queryKey: liveUpcomingKey("admin"),
    queryFn: () => {
      const { from, to } = windowBounds(8, 24 * 7);
      return listAdminUpcoming(from, to);
    },
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
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()
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
