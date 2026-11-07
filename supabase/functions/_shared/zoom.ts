// Shared Zoom helpers for the OAuth + live-sessions edge functions.
// Secrets live in the function environment only; tokens live in
// public.zoom_connection_secrets (RLS on, zero policies → service role only).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  chooseTokenAfterRefresh,
  isInvalidGrant,
  tokenFromParallelRotation,
} from "./zoom-token.ts";

const ZOOM_OAUTH = "https://zoom.us/oauth";
const ZOOM_API = "https://api.zoom.us/v2";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_SECRET:${name}`);
  return v;
}

function basicAuth(): string {
  return btoa(`${env("ZOOM_CLIENT_ID")}:${env("ZOOM_CLIENT_SECRET")}`);
}

export interface ZoomTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

/** Exchange a one-time OAuth code for a token pair. */
export async function zoomTokenExchange(code: string): Promise<ZoomTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env("ZOOM_REDIRECT_URI"),
  });
  const res = await fetch(`${ZOOM_OAUTH}/token?${body.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  if (!res.ok) throw new Error(`ZOOM_EXCHANGE_FAILED:${res.status}`);
  return (await res.json()) as ZoomTokenResponse;
}

/** Refresh an expired access token. Zoom rotates the refresh token on every call. */
export async function zoomRefresh(refreshToken: string): Promise<ZoomTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(`${ZOOM_OAUTH}/token?${body.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`ZOOM_REFRESH_FAILED:${res.status}`);
    (err as Error & { body?: string }).body = text;
    throw err;
  }
  return (await res.json()) as ZoomTokenResponse;
}

interface SecretRow {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

/**
 * Return a usable access token for `userId`, refreshing + persisting the rotated
 * pair when it is about to expire.
 *
 * Concurrency (F2): Zoom rotates the refresh token on every refresh, so two
 * parallel refreshes would make the second one fail with invalid_grant even
 * though nothing is wrong. Two guards:
 *   1. the write is a compare-and-swap on the refresh token we read;
 *   2. on failure we re-read the row — if the token changed, a parallel call
 *      already won and its access token is valid, so we use that.
 * The connection is marked revoked only when Zoom says invalid_grant *and* the
 * stored row is still the one we tried.
 */
export async function getValidAccessToken(
  service: SupabaseClient,
  userId: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  const { data: row, error } = await service
    .from("zoom_connection_secrets")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle<SecretRow>();

  if (error) throw new Error("ZOOM_SECRETS_READ_FAILED");
  if (!row) throw new Error("ZOOM_NOT_CONNECTED");

  const expiresAt = new Date(row.expires_at).getTime();
  const needsRefresh = opts.force === true || expiresAt < Date.now() + 60_000;
  if (!needsRefresh) return row.access_token;

  const usedRefresh = row.refresh_token;

  try {
    const fresh = await zoomRefresh(usedRefresh);
    const { data: written, error: writeError } = await service
      .from("zoom_connection_secrets")
      .update({
        access_token: fresh.access_token,
        refresh_token: fresh.refresh_token,
        expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("refresh_token", usedRefresh)
      .select("access_token");

    if (writeError) throw new Error("ZOOM_SECRETS_WRITE_FAILED");
    const landed = Boolean(written && written.length > 0);
    // G3: when our write did not land, a parallel call rotated first; use its
    // access token string (not the whole stored row).
    const stored = landed ? null : await readStoredToken(service, userId);
    return chooseTokenAfterRefresh(landed, stored, fresh.access_token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const body = (e as Error & { body?: string }).body ?? "";

    // Did a parallel call rotate the refresh token while we were failing?
    const stored = await readStoredToken(service, userId);
    const parallel = tokenFromParallelRotation(stored, usedRefresh);
    if (parallel) return parallel;

    if (isInvalidGrant(msg, body)) {
      await service
        .from("zoom_connections")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      throw new Error("ZOOM_REVOKED");
    }
    throw new Error("ZOOM_REFRESH_FAILED");
  }
}

async function readStoredToken(
  service: SupabaseClient,
  userId: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const { data } = await service
    .from("zoom_connection_secrets")
    .select("access_token, refresh_token")
    .eq("user_id", userId)
    .maybeSingle<Pick<SecretRow, "access_token" | "refresh_token">>();
  if (!data) return null;
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

/** Authenticated Zoom REST call; retries once with a forced refresh on 401. */
export async function zoomFetch(
  service: SupabaseClient,
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const call = async (force: boolean) => {
    const token = await getValidAccessToken(service, userId, { force });
    return fetch(`${ZOOM_API}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  };

  const first = await call(false);
  if (first.status !== 401) return first;
  return await call(true);
}

/** Convenience: JSON body or throw with the Zoom status + text. */
export async function zoomJson<T>(res: Response, code: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${code}:${res.status}:${text.slice(0, 300)}`);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// OAuth state (HMAC, 10 min expiry)
// ---------------------------------------------------------------------------
export interface StatePayload {
  uid: string;
  n: string;
  exp: number;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env("ZOOM_STATE_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signState(payload: { uid: string }): Promise<string> {
  const full: StatePayload = {
    uid: payload.uid,
    n: crypto.randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const data = b64url(new TextEncoder().encode(JSON.stringify(full)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(data)),
  );
  return `${data}.${b64url(sig)}`;
}

/** Returns the payload or null when the signature is bad, malformed, or expired. */
export async function verifyState(token: string): Promise<StatePayload | null> {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      b64urlDecode(sig),
      new TextEncoder().encode(data),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(data))) as StatePayload;
    if (!payload?.uid || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
