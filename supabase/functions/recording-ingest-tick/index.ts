// Recording ingest worker: pulls Zoom cloud MP4s into private R2 via the
// mona-live-media Worker, then publishes them as part-lessons.
//
// Called by pg_cron every minute with `x-cron-secret`. Each run keeps working
// through the job queue until 110 s have passed (the function wall clock is
// ~150 s), so a long recording is uploaded across several ticks by resuming
// from `bytes_done` + `parts`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getValidAccessToken } from "../_shared/zoom.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-cron-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUDGET_MS = 110_000;
const STALE_DOWNLOAD_MS = 20 * 3_600_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface Job {
  id: string;
  session_id: string;
  source: string;
  download_url: string | null;
  download_token: string | null;
  file_size: number | null;
  status: string;
  attempts: number;
  upload_id: string | null;
  parts: { partNumber: number; etag: string }[];
  bytes_done: number;
  part_size: number;
  r2_key: string | null;
  created_at: string;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const expected = Deno.env.get("LIVE_CRON_SECRET");
  if (!expected) return json({ error: "CRON_SECRET_MISSING" }, 500);
  if (req.headers.get("x-cron-secret") !== expected) return json({ error: "UNAUTHORIZED" }, 401);

  const mediaBase = Deno.env.get("MEDIA_BASE_URL");
  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!mediaBase || !ingestSecret) return json({ error: "MEDIA_NOT_CONFIGURED" }, 500);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const started = Date.now();
  const report: { processed: number[]; failed: number[]; note?: string } = {
    processed: [],
    failed: [],
  };

  /** Signed call to the ingest worker: X-Ts + X-Signature over ts.body. */
  const ingest = async (path: string, body: unknown): Promise<Response> => {
    const raw = JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000);
    const sig = await hmacHex(ingestSecret, `${ts}.${raw}`);
    return await fetch(`${mediaBase}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ts": String(ts),
        "X-Signature": sig,
      },
      body: raw,
    });
  };

  while (Date.now() - started < BUDGET_MS) {
    const { data: claimed, error: claimError } = await service.rpc("live_recording_claim_next");
    if (claimError) {
      report.note = `claim:${claimError.message}`;
      break;
    }
    const job = (claimed as Job[] | null)?.[0];
    if (!job) {
      report.note = "queue empty";
      break;
    }

    const fail = async (message: string, permanent = false) => {
      const attempts = job.attempts;
      const giveUp = permanent || attempts >= 8;
      await service
        .from("live_recordings")
        .update({
          status: giveUp ? "failed" : "pending",
          last_error: message.slice(0, 500),
          locked_until: giveUp
            ? null
            : new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000).toISOString(),
        })
        .eq("id", job.id);

      if (giveUp) {
        const { data: session } = await service
          .from("live_sessions")
          .select("title, course_id, host_user_id")
          .eq("id", job.session_id)
          .maybeSingle();
        if (session) {
          await service.from("notifications").insert({
            user_id: session.host_user_id,
            type: "live_recording_failed",
            title: "تعذّر نقل تسجيل الجلسة",
            body: session.title,
            template_data: { session_id: job.session_id, recording_id: job.id },
            action_url: `/admin/courses/${session.course_id}/builder`,
            related_entity_type: "live_session",
            related_entity_id: job.session_id,
          });
        }
        report.failed.push(job.attempts);
      }
    };

    if (job.file_size === null || job.file_size === undefined) {
      await fail("NO_SIZE", true);
      continue;
    }

    // ---- source URL ------------------------------------------------------
    const { data: session } = await service
      .from("live_sessions")
      .select("id, course_id, host_user_id")
      .eq("id", job.session_id)
      .maybeSingle();
    if (!session) {
      await fail("SESSION_MISSING", true);
      continue;
    }

    let sourceUrl = job.download_url ?? "";
    if (!sourceUrl) {
      await fail("NO_DOWNLOAD_URL", true);
      continue;
    }

    const age = Date.now() - new Date(job.created_at).getTime();
    const tokenExpired = age > STALE_DOWNLOAD_MS;
    const useOauth = tokenExpired || !job.download_token;
    if (useOauth) {
      try {
        const token = await getValidAccessToken(service, session.host_user_id);
        const sep = sourceUrl.includes("?") ? "&" : "?";
        sourceUrl = `${sourceUrl}${sep}access_token=${encodeURIComponent(token)}`;
      } catch (e) {
        await fail(`AUTH:${e instanceof Error ? e.message : "unknown"}`);
        continue;
      }
    } else {
      const sep = sourceUrl.includes("?") ? "&" : "?";
      sourceUrl = `${sourceUrl}${sep}access_token=${encodeURIComponent(job.download_token!)}`;
    }

    // ---- multipart setup -------------------------------------------------
    let uploadId = job.upload_id;
    let r2Key = job.r2_key ?? `live/${session.course_id}/${job.session_id}/${job.id}.mp4`;
    let parts = Array.isArray(job.parts) ? job.parts : [];
    let bytesDone = Number(job.bytes_done ?? 0);

    if (!uploadId) {
      const res = await ingest("/ingest/create", { key: r2Key, contentType: "video/mp4" });
      if (!res.ok) {
        await fail(`CREATE_${res.status}`);
        continue;
      }
      const body = (await res.json()) as { uploadId?: string };
      if (!body.uploadId) {
        await fail("CREATE_NO_UPLOAD_ID");
        continue;
      }
      uploadId = body.uploadId;
      await service
        .from("live_recordings")
        .update({ upload_id: uploadId, r2_key: r2Key, bytes_done: 0, parts: [] })
        .eq("id", job.id);
      parts = [];
      bytesDone = 0;
    }

    // ---- parts loop ------------------------------------------------------
    let single = false;
    let error: string | null = null;

    while (bytesDone < job.file_size) {
      if (Date.now() - started > BUDGET_MS) break;

      const partNumber = parts.length + 1;
      const rangeStart = bytesDone;
      const rangeEnd = Math.min(bytesDone + Number(job.part_size), job.file_size) - 1;

      const res = await ingest("/ingest/part", {
        key: r2Key,
        uploadId,
        partNumber,
        sourceUrl,
        rangeStart,
        rangeEnd,
      });

      if (!res.ok) {
        error = `PART_${res.status}`;
        break;
      }

      const body = (await res.json()) as {
        etag?: string;
        bytes?: number;
        rangeUnsupported?: boolean;
        error?: string;
      };

      if (body.rangeUnsupported) {
        // Zoom sometimes ignores Range. Fall back to one streamed PUT.
        if (job.file_size > 4.5 * 1024 ** 3) {
          await ingest("/ingest/abort", { key: r2Key, uploadId });
          await fail("RANGE_UNSUPPORTED_TOO_LARGE", true);
          single = true;
          break;
        }
        await ingest("/ingest/abort", { key: r2Key, uploadId });
        const singleRes = await ingest("/ingest/single", {
          key: r2Key,
          sourceUrl,
          size: job.file_size,
          contentType: "video/mp4",
        });
        if (!singleRes.ok) {
          error = `SINGLE_${singleRes.status}`;
          break;
        }
        single = true;
        bytesDone = job.file_size;
        break;
      }

      if (!body.etag || typeof body.bytes !== "number") {
        error = "PART_BAD_RESPONSE";
        break;
      }

      parts = [...parts, { partNumber, etag: body.etag }];
      bytesDone += body.bytes;

      await service
        .from("live_recordings")
        .update({
          parts,
          bytes_done: bytesDone,
          locked_until: new Date(Date.now() + 3 * 60_000).toISOString(),
        })
        .eq("id", job.id);
    }

    if (error) {
      await fail(error);
      continue;
    }
    if (Date.now() - started > BUDGET_MS && bytesDone < job.file_size) {
      // Out of budget mid-upload: release the lease; the next tick resumes.
      await service
        .from("live_recordings")
        .update({ status: "pending", locked_until: null })
        .eq("id", job.id);
      break;
    }

    if (!single) {
      const res = await ingest("/ingest/complete", { key: r2Key, uploadId, parts });
      if (!res.ok) {
        await fail(`COMPLETE_${res.status}`);
        continue;
      }
      const body = (await res.json()) as { size?: number };
      if (typeof body.size === "number") {
        await service.from("live_recordings").update({ file_size: body.size }).eq("id", job.id);
      }
    }

    await service
      .from("live_recordings")
      .update({ status: "ready", locked_until: null, bytes_done: job.file_size, last_error: null })
      .eq("id", job.id);

    await service.rpc("live_session_finalize", { _session_id: job.session_id });
    report.processed.push(job.attempts);
  }

  return json(report);
});
