// Zoom event webhook. verify_jwt = false: Zoom signs with our own token.
// Contract: always answer inside 3 s, and do no downloads here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zm-signature, x-zm-request-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Preference order for picking one MP4 per recording time slice. */
const RECORDING_PREFERENCE = [
  "shared_screen_with_speaker_view",
  "shared_screen_with_speaker_view(CC)",
  "speaker_view",
  "active_speaker",
  "gallery_view",
  "shared_screen",
];

function rankRecording(type: string | undefined): number {
  const idx = RECORDING_PREFERENCE.indexOf(type ?? "");
  return idx === -1 ? RECORDING_PREFERENCE.length : idx;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const secret = Deno.env.get("ZOOM_WEBHOOK_SECRET_TOKEN");
  if (!secret) return json({ error: "WEBHOOK_SECRET_MISSING" }, 500);

  // The raw text is what was signed — read it before any parsing.
  const rawBody = await req.text();

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }

  // --- endpoint validation handshake -------------------------------------
  if (payload?.event === "endpoint.url_validation") {
    const plainToken = payload?.payload?.plainToken as string | undefined;
    if (!plainToken) return json({ error: "PLAIN_TOKEN_MISSING" }, 400);
    return json({ plainToken, encryptedToken: await hmacHex(secret, plainToken) });
  }

  // --- signature check ----------------------------------------------------
  const signature = req.headers.get("x-zm-signature") ?? "";
  const timestamp = req.headers.get("x-zm-request-timestamp") ?? "";
  const tsNum = Number(timestamp);
  if (!signature || !Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }
  const expected = "v0=" + (await hmacHex(secret, `v0:${timestamp}:${rawBody}`));
  if (!timingSafeEqual(expected, signature)) return json({ error: "UNAUTHORIZED" }, 401);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const event = String(payload.event ?? "");
  const object = payload.payload?.object ?? {};

  // --- app deauthorized: the admin removed our app at Zoom -----------------
  if (event === "app_deauthorized") {
    const zoomUserId = String(payload.payload?.user_id ?? "");
    if (zoomUserId) {
      const { data: conn } = await service
        .from("zoom_connections")
        .select("user_id")
        .eq("zoom_user_id", zoomUserId)
        .maybeSingle();
      if (conn?.user_id) {
        await service.from("zoom_connection_secrets").delete().eq("user_id", conn.user_id);
        await service
          .from("zoom_connections")
          .update({ status: "revoked", updated_at: new Date().toISOString() })
          .eq("user_id", conn.user_id);
      }
    }
    return json({ ok: true });
  }

  if (!event.startsWith("meeting.") && event !== "recording.completed") {
    return json({ ignored: true });
  }

  // --- locate the segment -------------------------------------------------
  let segment: { id: string; session_id: string } | null = null;

  if (object.uuid) {
    const { data } = await service
      .from("live_session_segments")
      .select("id, session_id")
      .eq("zoom_meeting_uuid", String(object.uuid))
      .maybeSingle();
    segment = data ?? null;
  }
  if (!segment && object.id !== undefined) {
    const { data } = await service
      .from("live_session_segments")
      .select("id, session_id")
      .eq("zoom_meeting_id", Number(object.id))
      .order("segment_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    segment = data ?? null;
  }

  if (!segment) return json({ ignored: true });

  // --- meeting.started ----------------------------------------------------
  if (event === "meeting.started") {
    await service
      .from("live_session_segments")
      .update({ started_at: new Date().toISOString() })
      .eq("id", segment.id)
      .is("started_at", null);

    const { data: session } = await service
      .from("live_sessions")
      .select("id, course_id, title, status, started_at")
      .eq("id", segment.session_id)
      .maybeSingle();

    if (session) {
      if (session.status === "scheduled") {
        await service
          .from("live_sessions")
          .update({
            status: "live",
            started_at: session.started_at ?? new Date().toISOString(),
          })
          .eq("id", session.id);
      }

      // Dedupe: one "started" notification per session, ever.
      const { data: logged } = await service
        .from("live_session_notification_log")
        .insert({ session_id: session.id, kind: "started" })
        .select("session_id");
      if (logged && logged.length > 0) {
        const { data: enrollments } = await service
          .from("enrollments")
          .select("user_id")
          .eq("course_id", session.course_id);
        if (enrollments?.length) {
          await service.from("notifications").insert(
            enrollments.map((e: { user_id: string }) => ({
              user_id: e.user_id,
              type: "live_session_started",
              title: "بدأت الجلسة المباشرة",
              body: session.title,
              template_data: { session_id: session.id, course_id: session.course_id },
              action_url: `/courses/${session.course_id}/learn/live_session/${session.id}`,
              related_entity_type: "live_session",
              related_entity_id: session.id,
            })),
          );
        }
      }
    }
    return json({ ok: true });
  }

  // --- meeting.ended: close the segment only, never the session -----------
  if (event === "meeting.ended") {
    await service
      .from("live_session_segments")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", segment.id);
    return json({ ok: true });
  }

  // --- recording.completed -----------------------------------------------
  if (event === "recording.completed") {
    const downloadToken = payload.download_token ?? payload.payload?.download_token ?? null;
    const files = (object.recording_files ?? []) as Record<string, any>[];

    // One file per recording time slice, best layout wins.
    const bySlice = new Map<string, Record<string, any>>();
    for (const file of files) {
      if (file.file_type !== "MP4" || file.status !== "completed") continue;
      const slice = String(file.recording_start ?? file.id);
      const current = bySlice.get(slice);
      if (!current || rankRecording(file.recording_type) < rankRecording(current.recording_type)) {
        bySlice.set(slice, file);
      }
    }

    for (const file of bySlice.values()) {
      const { data: existing } = await service
        .from("live_recordings")
        .select("id, status")
        .eq("zoom_file_id", String(file.id))
        .maybeSingle();

      // Never regress a finished upload.
      if (existing?.status === "ready") continue;

      const row = {
        session_id: segment.session_id,
        segment_id: segment.id,
        source: "zoom_cloud",
        zoom_file_id: String(file.id),
        recording_type: file.recording_type ?? null,
        file_size: file.file_size ?? null,
        recording_start: file.recording_start ?? null,
        recording_end: file.recording_end ?? null,
        download_url: file.download_url ?? null,
        download_token: downloadToken,
        status: "pending",
        last_error: null,
        locked_until: null,
      };

      if (existing) {
        await service.from("live_recordings").update(row).eq("id", existing.id);
      } else {
        await service.from("live_recordings").insert(row);
      }
    }
    return json({ ok: true });
  }

  return json({ ignored: true });
});
