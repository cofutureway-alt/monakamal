// mona-live-media — private R2 gateway for live-session recordings.
//
// Two callers:
//   * the ingest worker (HMAC over timestamp + raw body, INGEST_SECRET)
//   * the browser (HMAC-signed, short-lived media/upload tokens, MEDIA_SIGNING_SECRET)
//
// Nothing here is public: an unsigned request gets 403, never a redirect.

export interface Env {
  RECORDINGS: R2Bucket;
  INGEST_SECRET: string;
  MEDIA_SIGNING_SECRET: string;
}

const ALLOWED_ORIGINS = [
  "https://www.miss-mona-kamel.com",
  "https://miss-mona-kamel.com",
  "http://localhost:8080",
];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB
const INGEST_SKEW_SECONDS = 300;

// ---------------------------------------------------------------------------
// crypto helpers
// ---------------------------------------------------------------------------
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

/** Length-independent compare so timing cannot leak the signature. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, HEAD, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "ETag, Content-Range, Accept-Ranges, Content-Length",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

async function verifyIngest(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const ts = req.headers.get("X-Ts");
  const sig = req.headers.get("X-Signature");
  if (!ts || !sig) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > INGEST_SKEW_SECONDS) return false;
  const expected = await hmacHex(secret, `${ts}.${rawBody}`);
  return timingSafeEqual(expected, sig);
}

/** `sig = HMAC(secret, method|key|u|exp)` */
async function verifyMediaToken(
  url: URL,
  key: string,
  method: string,
  secret: string,
): Promise<{ ok: boolean; exp: number }> {
  const u = url.searchParams.get("u");
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig");
  if (!u || !sig || !Number.isFinite(exp)) return { ok: false, exp: 0 };
  if (exp * 1000 < Date.now()) return { ok: false, exp };
  const expected = await hmacHex(secret, `${method}|${key}|${u}|${exp}`);
  return { ok: timingSafeEqual(expected, sig), exp };
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (e) {
      // Workers would otherwise emit an HTML 500 that callers cannot parse.
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error("worker_error", msg);
      const detail = e instanceof Error ? e.message.slice(0, 160) : "unknown";
      return json({ error: "INTERNAL", detail }, 500, request.headers.get("Origin"));
    }
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const path = url.pathname;

    // ---- media reads (browser, signed) ------------------------------------
    if ((request.method === "GET" || request.method === "HEAD") && path.startsWith("/media/")) {
      const key = decodeURIComponent(path.slice("/media/".length));
      const check = await verifyMediaToken(url, key, "GET", env.MEDIA_SIGNING_SECRET);
      if (!check.ok) return json({ error: "FORBIDDEN" }, 403, origin);

      // Pass `range` only when a Range header exists: R2 treats the mere
      // presence of the option as a range request and answers 206 for a plain GET.
      const options: R2GetOptions = request.headers.has("Range")
        ? { range: request.headers }
        : {};
      const obj = await env.RECORDINGS.get(key, options);
      if (!obj) return json({ error: "NOT_FOUND" }, 404, origin);

      const headers = new Headers(corsHeaders(origin));
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "private, no-store");
      headers.set("Content-Type", obj.httpMetadata?.contentType ?? "video/mp4");
      if (obj.size !== undefined) headers.set("Content-Length", String(obj.size));

      // R2 reports range metadata even for an un-ranged get, so the decision is
      // made from the request: only answer 206 when the client asked for a range.
      if (request.headers.has("Range") && obj.range) {
        const r = obj.range as { offset: number; length?: number };
        const total = obj.size;
        headers.set(
          "Content-Range",
          `bytes ${r.offset}-${r.offset + (r.length ?? total - r.offset) - 1}/${total}`,
        );
        headers.set("Content-Length", String(r.length ?? total - r.offset));
        return new Response(request.method === "HEAD" ? null : obj.body, { status: 206, headers });
      }

      return new Response(request.method === "HEAD" ? null : obj.body, { status: 200, headers });
    }

    // ---- manual upload (browser, signed PUT) -------------------------------
    if (request.method === "PUT" && path.startsWith("/upload/")) {
      const key = decodeURIComponent(path.slice("/upload/".length));
      const check = await verifyMediaToken(url, key, "PUT", env.MEDIA_SIGNING_SECRET);
      if (!check.ok) return json({ error: "FORBIDDEN" }, 403, origin);

      const length = Number(request.headers.get("Content-Length") ?? "0");
      if (!length) return json({ error: "CONTENT_LENGTH_REQUIRED" }, 411, origin);
      if (length > MAX_UPLOAD_BYTES) return json({ error: "TOO_LARGE" }, 413, origin);

      const contentType = request.headers.get("Content-Type") ?? "video/mp4";
      const put = await env.RECORDINGS.put(key, request.body, {
        httpMetadata: { contentType },
      });
      return json({ size: put?.size ?? length }, 200, origin);
    }

    // ---- ingest (worker, body-signed) -------------------------------------
    if (request.method === "POST" && path.startsWith("/ingest/")) {
      const rawBody = await request.text();
      if (!(await verifyIngest(request, rawBody, env.INGEST_SECRET))) {
        return json({ error: "UNAUTHORIZED" }, 401, origin);
      }

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody || "{}");
      } catch {
        return json({ error: "BAD_JSON" }, 400, origin);
      }

      const action = path.slice("/ingest/".length);

      if (action === "create") {
        const key = String(body.key ?? "");
        if (!key) return json({ error: "KEY_REQUIRED" }, 400, origin);
        const upload = await env.RECORDINGS.createMultipartUpload(key, {
          httpMetadata: { contentType: String(body.contentType ?? "video/mp4") },
        });
        return json({ uploadId: upload.uploadId }, 200, origin);
      }

      if (action === "part") {
        const { key, uploadId, partNumber, sourceUrl, rangeStart, rangeEnd } = body as {
          key: string;
          uploadId: string;
          partNumber: number;
          sourceUrl: string;
          rangeStart: number;
          rangeEnd: number;
        };
        if (!key || !uploadId || !partNumber || !sourceUrl) {
          return json({ error: "MISSING_FIELDS" }, 400, origin);
        }

        const upload = env.RECORDINGS.resumeMultipartUpload(key, uploadId);
        const upstream = await fetch(sourceUrl, {
          headers: { Range: `bytes=${rangeStart}-${rangeEnd}` },
          redirect: "follow",
        });

        if (upstream.status === 200) {
          // The source ignored Range: cancel the body and tell the caller to
          // fall back to a single streaming PUT.
          await upstream.body?.cancel();
          return json({ rangeUnsupported: true }, 200, origin);
        }
        if (upstream.status !== 206) {
          await upstream.body?.cancel();
          return json({ error: `SOURCE_${upstream.status}` }, 502, origin);
        }

        // R2's uploadPart requires a stream of known length; an upstream fetch
        // body has none, so buffer this one part (<= part_size, 32 MiB) first.
        const chunk = await upstream.arrayBuffer();
        const part = await upload.uploadPart(partNumber, chunk);
        // R2UploadedPart carries only the etag, so the byte count is what we
        // actually sent (the caller needs it to resume from the right offset).
        return json({ etag: part.etag, bytes: chunk.byteLength }, 200, origin);
      }

      if (action === "complete") {
        const { key, uploadId, parts } = body as {
          key: string;
          uploadId: string;
          parts: { partNumber: number; etag: string }[];
        };
        const upload = env.RECORDINGS.resumeMultipartUpload(key, uploadId);
        const obj = await upload.complete(parts);
        return json({ size: obj.size }, 200, origin);
      }

      if (action === "abort") {
        const { key, uploadId } = body as { key: string; uploadId: string };
        const upload = env.RECORDINGS.resumeMultipartUpload(key, uploadId);
        await upload.abort();
        return json({ ok: true }, 200, origin);
      }

      if (action === "single") {
        const { key, sourceUrl, size, contentType } = body as {
          key: string;
          sourceUrl: string;
          size: number;
          contentType?: string;
        };
        if (!key || !sourceUrl) return json({ error: "MISSING_FIELDS" }, 400, origin);

        const upstream = await fetch(sourceUrl, { redirect: "follow" });
        if (!upstream.ok || !upstream.body) {
          await upstream.body?.cancel();
          return json({ error: `SOURCE_${upstream.status}` }, 502, origin);
        }

        // FixedLengthStream lets R2 write a stream of known length without
        // buffering; it throws early if the upstream sends a different size.
        const stream = upstream.body.pipeThrough(new FixedLengthStream(size));
        const put = await env.RECORDINGS.put(key, stream, {
          httpMetadata: { contentType: contentType ?? "video/mp4" },
        });
        return json({ size: put?.size ?? size }, 200, origin);
      }

      return json({ error: "NOT_FOUND" }, 404, origin);
    }

    return json({ error: "NOT_FOUND" }, 404, origin);
}
