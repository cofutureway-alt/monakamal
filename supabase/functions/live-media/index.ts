// Signed playback / upload URLs for recordings held in private R2.
// Everything that touches storage goes through the mona-live-media Worker; this
// function only mints tokens, so no bucket credentials live in the web app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLAYBACK_TTL_S = 4 * 3600;
const UPLOAD_TTL_S = 2 * 3600;

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

/** Builds `/media/<key>` or `/upload/<key>` URL with u/exp/sig. */
async function signedUrl(
  base: string,
  secret: string,
  kind: "media" | "upload",
  key: string,
  userId: string,
  ttlSeconds: number,
  method: string,
): Promise<{ url: string; expiresAt: string }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmacHex(secret, `${method}|${key}|${userId}|${exp}`);
  const path = kind === "media" ? "media" : "upload";
  return {
    url: `${base}/${path}/${key}?u=${encodeURIComponent(userId)}&exp=${exp}&sig=${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return json({ error: "UNAUTHENTICATED" }, 401);
  const callerId = userRes.user.id;

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin } = await service.rpc("has_role", {
    _user_id: callerId,
    _role: "admin",
  });

  const mediaBase = Deno.env.get("MEDIA_BASE_URL");
  const signingSecret = Deno.env.get("MEDIA_SIGNING_SECRET");
  if (!mediaBase || !signingSecret) return json({ error: "MEDIA_NOT_CONFIGURED" }, 500);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  const action = String(body.action ?? "");

  // ---------------------------------------------------------------- playback
  if (action === "playback_url") {
    const lessonId = String(body.lesson_id ?? "");
    if (!lessonId) return json({ error: "MISSING_FIELDS" }, 400);

    const { data: lesson } = await service
      .from("lessons")
      .select("id, unit_id, video_provider, video_url")
      .eq("id", lessonId)
      .maybeSingle();

    if (!lesson || lesson.video_provider !== "r2" || !lesson.video_url) {
      return json({ error: "NOT_AN_R2_LESSON" }, 404);
    }

    if (!isAdmin) {
      const { data: unit } = await service
        .from("units")
        .select("course_id")
        .eq("id", lesson.unit_id)
        .maybeSingle();
      if (!unit) return json({ error: "FORBIDDEN" }, 403);

      const { data: enrolled } = await service.rpc("is_enrolled_in_course", {
        _user: callerId,
        _course: unit.course_id,
      });
      if (!enrolled) return json({ error: "NOT_ENROLLED" }, 403);

      // Respect the same lock rules the lesson list uses: a locked lesson must
      // not hand out a playable URL.
      const { data: locks } = await service.rpc("resolve_course_lock_state", {
        _course_id: unit.course_id,
        _user_id: callerId,
      });
      const lock = (locks ?? []).find(
        (r: { item_type: string; item_id: string }) =>
          r.item_type === "lesson" && r.item_id === lessonId,
      );
      if (lock?.is_locked) return json({ error: "LOCKED" }, 403);
    }

    const signed = await signedUrl(
      mediaBase,
      signingSecret,
      "media",
      lesson.video_url,
      callerId,
      PLAYBACK_TTL_S,
      "GET",
    );
    return json({ url: signed.url, expires_at: signed.expiresAt });
  }

  // Everything below is admin-only.
  if (!isAdmin) return json({ error: "FORBIDDEN" }, 403);

  // ------------------------------------------------------------ upload set-up
  if (action === "upload_url") {
    const sessionId = String(body.session_id ?? "");
    const fileName = String(body.file_name ?? "recording.mp4");
    const fileSize = Number(body.file_size ?? 0);
    const contentType = String(body.content_type ?? "video/mp4");

    if (!sessionId || !fileSize) return json({ error: "MISSING_FIELDS" }, 400);
    if (fileSize > 5 * 1024 ** 3) return json({ error: "TOO_LARGE" }, 400);

    const { data: session } = await service
      .from("live_sessions")
      .select("id, course_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return json({ error: "SESSION_NOT_FOUND" }, 404);

    const key = `live/${session.course_id}/${sessionId}/${crypto.randomUUID()}.mp4`;
    const { data: recording, error } = await service
      .from("live_recordings")
      .insert({
        session_id: sessionId,
        source: "manual_upload",
        status: "uploading",
        r2_key: key,
        file_size: fileSize,
        recording_type: "manual",
      })
      .select("id")
      .single();
    if (error || !recording) return json({ error: "RECORDING_CREATE_FAILED" }, 422);

    const signed = await signedUrl(
      mediaBase,
      signingSecret,
      "upload",
      key,
      callerId,
      UPLOAD_TTL_S,
      "PUT",
    );
    return json({
      recording_id: recording.id,
      upload_url: signed.url,
      content_type: contentType,
      file_name: fileName,
      expires_at: signed.expiresAt,
    });
  }

  // ------------------------------------------------------- upload completion
  if (action === "upload_complete") {
    const recordingId = String(body.recording_id ?? "");
    if (!recordingId) return json({ error: "MISSING_FIELDS" }, 400);

    const { data: recording } = await service
      .from("live_recordings")
      .select("id, session_id, r2_key, file_size, source")
      .eq("id", recordingId)
      .maybeSingle();
    if (!recording) return json({ error: "RECORDING_NOT_FOUND" }, 404);

    // Confirm the object really landed before publishing it.
    const head = await signedUrl(
      mediaBase,
      signingSecret,
      "media",
      recording.r2_key!,
      callerId,
      300,
      "GET",
    );
    const check = await fetch(head.url, { method: "HEAD" });
    if (!check.ok) return json({ error: "OBJECT_NOT_FOUND", status: check.status }, 422);

    const size = Number(check.headers.get("content-length") ?? recording.file_size ?? 0);
    await service
      .from("live_recordings")
      .update({
        status: "ready",
        file_size: size,
        recording_start: body.recording_start ?? new Date().toISOString(),
        last_error: null,
        locked_until: null,
      })
      .eq("id", recordingId);

    await service.rpc("live_session_finalize", { _session_id: recording.session_id });
    return json({ ok: true, size });
  }

  if (action === "retry_recording") {
    const recordingId = String(body.recording_id ?? "");
    if (!recordingId) return json({ error: "MISSING_FIELDS" }, 400);
    const { error } = await service
      .from("live_recordings")
      .update({ status: "pending", attempts: 0, locked_until: null, last_error: null })
      .eq("id", recordingId);
    if (error) return json({ error: "RETRY_FAILED" }, 422);
    return json({ ok: true });
  }

  if (action === "list_recordings") {
    const sessionId = String(body.session_id ?? "");
    if (!sessionId) return json({ error: "MISSING_FIELDS" }, 400);
    const { data } = await service
      .from("live_recordings")
      .select(
        "id, part_index, source, recording_type, file_size, status, attempts, last_error, bytes_done, recording_start, recording_end, lesson_id, created_at",
      )
      .eq("session_id", sessionId)
      .order("part_index", { ascending: true, nullsFirst: false });
    return json({ recordings: data ?? [] });
  }

  return json({ error: "UNKNOWN_ACTION" }, 400);
});
