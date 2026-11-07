// Admin-only live session management (create / update / cancel / delete / host list).
// Zoom meetings are created through the host's stored OAuth token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CORS_HEADERS, zoomFetch, zoomJson } from "../_shared/zoom.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface SessionRow {
  id: string;
  course_id: string;
  unit_id: string | null;
  title: string;
  description: string | null;
  scheduled_start_at: string;
  duration_minutes: number;
  host_user_id: string;
  status: string;
  link_version: number;
  position: number;
  recording_enabled: boolean;
}

const ARABIC_ERRORS: Record<string, string> = {
  UNAUTHENTICATED: "يجب تسجيل الدخول",
  FORBIDDEN: "ليس لديك صلاحية",
  SESSION_NOT_FOUND: "الجلسة غير موجودة",
  START_TOO_SOON: "يجب أن يكون الموعد بعد 5 دقائق على الأقل من الآن",
  INVALID_DURATION: "المدة يجب أن تكون بين 15 و 480 دقيقة",
  ZOOM_NOT_CONNECTED: "اربط حساب Zoom أولاً",
  ZOOM_REVOKED: "انتهت صلاحية الربط. يرجى إعادة ربط حساب Zoom.",
  ZOOM_CREATE_FAILED: "تعذّر إنشاء اجتماع Zoom. حاول مرة أخرى.",
  ZOOM_UPDATE_FAILED: "تعذّر تحديث اجتماع Zoom.",
  SESSION_NOT_SCHEDULED: "لا يمكن تعديل جلسة بدأت بالفعل",
  SESSION_NOT_DELETABLE: "لا يمكن حذف جلسة بدأت بالفعل",
  SESSION_NOT_CANCELLABLE: "لا يمكن إلغاء جلسة انتهت",
};

function fail(code: string, status: number, detail?: string) {
  return json({ error: code, message_ar: ARABIC_ERRORS[code] ?? code, message: detail ?? code }, status);
}

/** Best-effort Zoom meeting cleanup on a rollback path (F8). */
async function discardZoomMeeting(service: any, hostId: string, meetingId: unknown) {
  if (meetingId === null || meetingId === undefined) return;
  try {
    await zoomFetch(service, hostId, `/meetings/${meetingId}`, { method: "DELETE" });
  } catch {
    // Orphaned at Zoom is worse than silent here, but the local failure is the
    // one the caller must see; the meeting expires on its own.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return fail("UNAUTHENTICATED", 401);

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: isAdmin } = await service.rpc("has_role", {
    _user_id: userRes.user.id,
    _role: "admin",
  });
  if (!isAdmin) return fail("FORBIDDEN", 403);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST", 400);
  }
  const action = String(body.action ?? "");

  // ---------------------------------------------------------------- hosts
  if (action === "host_admins") {
    const { data } = await service
      .from("zoom_connections")
      .select("user_id, zoom_email, zoom_account_type, status, profiles:user_id(full_name)")
      .eq("status", "active");
    const hosts = (data ?? []).map((row: any) => ({
      user_id: row.user_id,
      full_name: row.profiles?.full_name ?? null,
      zoom_email: row.zoom_email ?? null,
      zoom_account_type: row.zoom_account_type ?? null,
    }));
    return json({ hosts });
  }

  // --------------------------------------------------------------- create
  if (action === "create") {
    const {
      course_id,
      unit_id,
      create_unit_title,
      title,
      description,
      scheduled_start_at,
      duration_minutes,
      host_user_id,
      recording_enabled,
    } = body;

    if (!course_id || !title || !scheduled_start_at || !duration_minutes || !host_user_id) {
      return fail("MISSING_FIELDS", 400);
    }
    const duration = Number(duration_minutes);
    if (duration < 15 || duration > 480) return fail("INVALID_DURATION", 400);

    const startMs = new Date(scheduled_start_at).getTime();
    if (!Number.isFinite(startMs) || startMs < Date.now() + 5 * 60_000) {
      return fail("START_TOO_SOON", 400);
    }

    const { data: hostConn } = await service
      .from("zoom_connections")
      .select("status")
      .eq("user_id", host_user_id)
      .maybeSingle();
    if (!hostConn) return fail("ZOOM_NOT_CONNECTED", 400);
    if (hostConn.status !== "active") return fail("ZOOM_REVOKED", 409);

    // Optional: create the unit on the fly.
    let resolvedUnitId: string | null = unit_id ?? null;
    let createdUnitId: string | null = null;
    if (!resolvedUnitId && create_unit_title) {
      const { data: maxUnit } = await service
        .from("units")
        .select("position")
        .eq("course_id", course_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: newUnit, error: unitError } = await service
        .from("units")
        .insert({
          course_id,
          title: create_unit_title,
          position: (maxUnit?.position ?? 0) + 1,
        })
        .select("id")
        .single();
      if (unitError || !newUnit) return fail("UNIT_CREATE_FAILED", 422, unitError?.message);
      resolvedUnitId = newUnit.id;
      createdUnitId = newUnit.id;
    }

    // Order inside the unit: after lessons and existing sessions.
    let position = 1;
    if (resolvedUnitId) {
      const [{ data: lastLesson }, { data: lastSession }] = await Promise.all([
        service
          .from("lessons")
          .select("position")
          .eq("unit_id", resolvedUnitId)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle(),
        service
          .from("live_sessions")
          .select("position")
          .eq("unit_id", resolvedUnitId)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      position = Math.max(lastLesson?.position ?? 0, lastSession?.position ?? 0) + 1;
    }

    // Ask Zoom first: no local row if the meeting cannot be created.
    let meeting: any;
    try {
      const res = await zoomFetch(service, host_user_id, "/users/me/meetings", {
        method: "POST",
        body: JSON.stringify({
          topic: title,
          type: 2,
          start_time: new Date(startMs).toISOString().replace(".000Z", "Z"),
          duration,
          timezone: "Africa/Cairo",
          agenda: description ?? undefined,
          settings: {
            join_before_host: false,
            waiting_room: false,
            mute_upon_entry: true,
            approval_type: 2,
            auto_recording: recording_enabled === false ? "none" : "cloud",
            meeting_authentication: false,
          },
        }),
      });
      meeting = await zoomJson<any>(res, "ZOOM_CREATE_FAILED");
    } catch (e) {
      if (createdUnitId) await service.from("units").delete().eq("id", createdUnitId);
      const msg = e instanceof Error ? e.message : String(e);
      return fail(msg.includes("ZOOM_NOT_CONNECTED") || msg.includes("ZOOM_REVOKED")
        ? (msg.includes("ZOOM_REVOKED") ? "ZOOM_REVOKED" : "ZOOM_NOT_CONNECTED")
        : "ZOOM_CREATE_FAILED", 422, msg);
    }

    const { data: session, error: sessionError } = await service
      .from("live_sessions")
      .insert({
        course_id,
        unit_id: resolvedUnitId,
        title,
        description: description ?? null,
        scheduled_start_at: new Date(startMs).toISOString(),
        duration_minutes: duration,
        host_user_id,
        status: "scheduled",
        recording_enabled: recording_enabled !== false,
        position,
        created_by: userRes.user.id,
      })
      .select("*")
      .single<SessionRow>();

    if (sessionError || !session) {
      await discardZoomMeeting(service, host_user_id, meeting.id);
      if (createdUnitId) await service.from("units").delete().eq("id", createdUnitId);
      return fail("SESSION_CREATE_FAILED", 422, sessionError?.message);
    }

    const { data: segment, error: segmentError } = await service
      .from("live_session_segments")
      .insert({
        session_id: session.id,
        segment_index: 1,
        source: "zoom_api",
        zoom_meeting_id: meeting.id ?? null,
        zoom_meeting_uuid: meeting.uuid ?? null,
        join_url: meeting.join_url,
        password: meeting.password ?? null,
        created_by: userRes.user.id,
      })
      .select("id")
      .single();

    if (segmentError || !segment) {
      await service.from("live_sessions").delete().eq("id", session.id);
      if (createdUnitId) await service.from("units").delete().eq("id", createdUnitId);
      await discardZoomMeeting(service, host_user_id, meeting.id);
      return fail("SEGMENT_CREATE_FAILED", 422, segmentError?.message);
    }

    await service.from("live_session_secrets").insert({
      segment_id: segment.id,
      start_url: meeting.start_url ?? null,
      start_url_fetched_at: new Date().toISOString(),
    });
    await service
      .from("live_sessions")
      .update({ current_segment_id: segment.id })
      .eq("id", session.id);

    // Notify enrolled students.
    const { data: course } = await service
      .from("courses")
      .select("title")
      .eq("id", course_id)
      .maybeSingle();
    const { data: enrollments } = await service
      .from("enrollments")
      .select("user_id")
      .eq("course_id", course_id);

    if (enrollments?.length) {
      await service.from("notifications").insert(
        enrollments.map((e: { user_id: string }) => ({
          user_id: e.user_id,
          type: "live_session_scheduled",
          title: "جلسة مباشرة جديدة",
          body: `${title} — ${course?.title ?? ""}`,
          template_data: {
            session_id: session.id,
            course_id,
            start_at: session.scheduled_start_at,
          },
          action_url: `/courses/${course_id}/learn/live_session/${session.id}`,
          related_entity_type: "live_session",
          related_entity_id: session.id,
        })),
      );
    }

    return json({ session });
  }

  // --------------------------------------------------------------- update
  if (action === "update") {
    const { session_id } = body;
    if (!session_id) return fail("MISSING_FIELDS", 400);

    const { data: session } = await service
      .from("live_sessions")
      .select("*")
      .eq("id", session_id)
      .maybeSingle<SessionRow>();
    if (!session) return fail("SESSION_NOT_FOUND", 404);
    if (session.status !== "scheduled") return fail("SESSION_NOT_SCHEDULED", 409);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.title === "string") patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.duration_minutes !== undefined) {
      const d = Number(body.duration_minutes);
      if (d < 15 || d > 480) return fail("INVALID_DURATION", 400);
      patch.duration_minutes = d;
    }
    if (typeof body.recording_enabled === "boolean") {
      patch.recording_enabled = body.recording_enabled;
    }
    let timeChanged = false;
    if (body.scheduled_start_at) {
      const startMs = new Date(body.scheduled_start_at).getTime();
      if (!Number.isFinite(startMs) || startMs < Date.now() + 5 * 60_000) {
        return fail("START_TOO_SOON", 400);
      }
      patch.scheduled_start_at = new Date(startMs).toISOString();
      timeChanged = startMs !== new Date(session.scheduled_start_at).getTime();
    }

    const { data: segment } = await service
      .from("live_session_segments")
      .select("zoom_meeting_id")
      .eq("session_id", session_id)
      .order("segment_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (segment?.zoom_meeting_id) {
      const zoomPatch: Record<string, unknown> = {};
      if (patch.title) zoomPatch.topic = patch.title;
      if (patch.scheduled_start_at) {
        zoomPatch.start_time = new Date(patch.scheduled_start_at as string)
          .toISOString()
          .replace(".000Z", "Z");
        zoomPatch.timezone = "Africa/Cairo";
      }
      if (patch.duration_minutes) zoomPatch.duration = patch.duration_minutes;
      if (body.description !== undefined) zoomPatch.agenda = body.description ?? "";
      if (body.recording_enabled !== undefined) {
        zoomPatch.settings = { auto_recording: body.recording_enabled ? "cloud" : "none" };
      }
      if (Object.keys(zoomPatch).length) {
        try {
          const res = await zoomFetch(
            service,
            session.host_user_id,
            `/meetings/${segment.zoom_meeting_id}`,
            { method: "PATCH", body: JSON.stringify(zoomPatch) },
          );
          if (!res.ok) throw new Error(`ZOOM_UPDATE_FAILED:${res.status}`);
        } catch (e) {
          return fail("ZOOM_UPDATE_FAILED", 422, e instanceof Error ? e.message : String(e));
        }
      }
    }

    const { data: updated, error } = await service
      .from("live_sessions")
      .update(patch)
      .eq("id", session_id)
      .select("*")
      .single<SessionRow>();
    if (error) return fail("SESSION_UPDATE_FAILED", 422, error.message);

    // A moved session must be able to fire its reminders again.
    if (timeChanged) {
      await service.from("live_session_notification_log").delete().eq("session_id", session_id);
    }

    return json({ session: updated });
  }

  // --------------------------------------------------------------- cancel
  if (action === "cancel") {
    const { session_id } = body;
    if (!session_id) return fail("MISSING_FIELDS", 400);

    const { data: session } = await service
      .from("live_sessions")
      .select("*")
      .eq("id", session_id)
      .maybeSingle<SessionRow>();
    if (!session) return fail("SESSION_NOT_FOUND", 404);
    // Only a session that has not finished can be cancelled (F9).
    if (session.status !== "scheduled" && session.status !== "live") {
      return fail("SESSION_NOT_CANCELLABLE", 409);
    }

    const { data: segment } = await service
      .from("live_session_segments")
      .select("zoom_meeting_id")
      .eq("session_id", session_id)
      .order("segment_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (segment?.zoom_meeting_id) {
      try {
        const res = await zoomFetch(
          service,
          session.host_user_id,
          `/meetings/${segment.zoom_meeting_id}`,
          { method: "DELETE" },
        );
        // 404 = already gone at Zoom; nothing to do.
        if (!res.ok && res.status !== 404) {
          console.error("zoom delete failed", res.status);
        }
      } catch {
        // Ignore: cancellation must succeed locally even if Zoom is unreachable.
      }
    }

    const { data: updated } = await service
      .from("live_sessions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", session_id)
      .select("*")
      .single<SessionRow>();

    const { data: course } = await service
      .from("courses")
      .select("title")
      .eq("id", session.course_id)
      .maybeSingle();
    const { data: enrollments } = await service
      .from("enrollments")
      .select("user_id")
      .eq("course_id", session.course_id);

    if (enrollments?.length) {
      await service.from("notifications").insert(
        enrollments.map((e: { user_id: string }) => ({
          user_id: e.user_id,
          type: "live_session_cancelled",
          title: "تم إلغاء جلسة مباشرة",
          body: `${session.title} — ${course?.title ?? ""}`,
          template_data: { session_id, course_id: session.course_id },
          action_url: `/courses/${session.course_id}/learn/live_session/${session_id}`,
          related_entity_type: "live_session",
          related_entity_id: session_id,
        })),
      );
    }

    return json({ session: updated });
  }

  // --------------------------------------------------------------- delete
  if (action === "delete") {
    const { session_id } = body;
    if (!session_id) return fail("MISSING_FIELDS", 400);

    const { data: session } = await service
      .from("live_sessions")
      .select("*")
      .eq("id", session_id)
      .maybeSingle<SessionRow>();
    if (!session) return fail("SESSION_NOT_FOUND", 404);
    if (session.status !== "scheduled" && session.status !== "cancelled") {
      return fail("SESSION_NOT_DELETABLE", 409);
    }

    const { data: segment } = await service
      .from("live_session_segments")
      .select("zoom_meeting_id")
      .eq("session_id", session_id)
      .order("segment_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (segment?.zoom_meeting_id) {
      try {
        await zoomFetch(service, session.host_user_id, `/meetings/${segment.zoom_meeting_id}`, {
          method: "DELETE",
        });
      } catch {
        // Ignore: row removal is the user-visible outcome.
      }
    }

    const { error } = await service.from("live_sessions").delete().eq("id", session_id);
    if (error) return fail("SESSION_DELETE_FAILED", 422, error.message);
    return json({ ok: true });
  }

  return fail("UNKNOWN_ACTION", 400);
});
