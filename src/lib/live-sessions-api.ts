import { supabase } from "@/integrations/supabase/client";

export type LiveSessionStatus = "scheduled" | "live" | "ended" | "completed" | "cancelled";

export interface LiveSessionFileMeta {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  allow_download: boolean;
  storage_path: string;
}

export interface LiveSessionState {
  id: string;
  course_id: string;
  unit_id: string | null;
  title: string;
  description: string | null;
  status: LiveSessionStatus;
  scheduled_start_at: string;
  duration_minutes: number;
  server_now: string;
  join_opens_at: string;
  host_start_opens_at: string;
  can_join: boolean;
  link_version: number;
  segment_count: number;
  files: LiveSessionFileMeta[];
  recordings: LiveSessionRecordingPart[];
  processing_count: number;
  no_recording_reason: string | null;
  i_joined: boolean;
}

export interface LiveSessionRecordingPart {
  part_index: number;
  lesson_id: string;
  status: string;
  duration_minutes: number | null;
}

export interface LiveSessionJoin {
  join_url: string;
  password: string | null;
  segment_index: number;
  link_version: number;
  server_now: string;
}

export interface UpcomingLiveSession {
  id: string;
  course_id: string;
  course_title: string;
  course_thumbnail_url: string | null;
  title: string;
  scheduled_start_at: string;
  duration_minutes: number;
  status: LiveSessionStatus;
  link_version: number;
  unit_id: string | null;
}

export interface AdminUpcomingLiveSession extends UpcomingLiveSession {
  host_user_id: string;
  host_name: string | null;
}

export interface ZoomHost {
  user_id: string;
  full_name: string | null;
  zoom_email: string | null;
  zoom_account_type: number | null;
}

export interface CreateLiveSessionInput {
  course_id: string;
  unit_id: string | null;
  create_unit_title?: string | null;
  title: string;
  description?: string | null;
  scheduled_start_at: string;
  duration_minutes: number;
  host_user_id: string;
  recording_enabled: boolean;
}

export interface LiveSessionRow {
  id: string;
  course_id: string;
  unit_id: string | null;
  title: string;
  scheduled_start_at: string;
  duration_minutes: number;
  status: LiveSessionStatus;
  host_user_id: string;
  link_version: number;
  position: number;
}

/** Arabic copy for every error code the DB/edge layer can raise. */
export const LIVE_SESSION_ERRORS: Record<string, string> = {
  NOT_ENROLLED: "يجب الالتحاق بالدورة أولاً",
  NOT_OPEN_YET: "لم يحن موعد الجلسة بعد",
  SESSION_OVER: "انتهت الجلسة",
  SESSION_CANCELLED: "تم إلغاء هذه الجلسة",
  SESSION_NOT_FOUND: "الجلسة غير موجودة",
  ZOOM_CREATE_FAILED: "تعذّر إنشاء اجتماع Zoom. حاول مرة أخرى.",
  ZOOM_NOT_CONNECTED: "اربط حساب Zoom أولاً",
  ZOOM_REVOKED: "انتهت صلاحية الربط. يرجى إعادة ربط حساب Zoom.",
  FORBIDDEN: "ليس لديك صلاحية",
  START_TOO_SOON: "يجب أن يكون الموعد بعد 5 دقائق على الأقل من الآن",
};

export function liveErrorMessage(codeOrMessage: string | null | undefined): string {
  if (!codeOrMessage) return "حدث خطأ غير متوقع";
  const key = Object.keys(LIVE_SESSION_ERRORS).find((k) => codeOrMessage.includes(k));
  return key ? LIVE_SESSION_ERRORS[key] : codeOrMessage;
}

function rpcCode(message: string | undefined): string {
  if (!message) return "UNKNOWN";
  const key = Object.keys(LIVE_SESSION_ERRORS).find((k) => message.includes(k));
  return key ?? message;
}

export class LiveSessionError extends Error {
  code: string;
  constructor(code: string) {
    super(liveErrorMessage(code));
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------
export async function getLiveSessionState(sessionId: string): Promise<LiveSessionState> {
  const { data, error } = await supabase.rpc("get_live_session_state", { _session_id: sessionId });
  if (error) throw new LiveSessionError(rpcCode(error.message));
  return data as unknown as LiveSessionState;
}

export async function getLiveSessionJoin(sessionId: string): Promise<LiveSessionJoin> {
  const { data, error } = await supabase.rpc("get_live_session_join", { _session_id: sessionId });
  if (error) throw new LiveSessionError(rpcCode(error.message));
  return data as unknown as LiveSessionJoin;
}

export async function listStudentUpcoming(
  from: string,
  to: string,
): Promise<UpcomingLiveSession[]> {
  const { data, error } = await supabase.rpc("student_upcoming_live_sessions", { _from: from, _to: to });
  if (error) throw new LiveSessionError(rpcCode(error.message));
  return (data ?? []) as unknown as UpcomingLiveSession[];
}

export async function listAdminUpcoming(
  from: string,
  to: string,
): Promise<AdminUpcomingLiveSession[]> {
  const { data, error } = await supabase.rpc("admin_upcoming_live_sessions", { _from: from, _to: to });
  if (error) throw new LiveSessionError(rpcCode(error.message));
  return (data ?? []) as unknown as AdminUpcomingLiveSession[];
}

// ---------------------------------------------------------------------------
// Edge function `live-sessions` (admin only)
// ---------------------------------------------------------------------------
async function invokeLiveSessions<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? "";
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/live-sessions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    message_ar?: string;
    session?: LiveSessionRow;
  };

  if (!res.ok || payload.error) {
    throw new LiveSessionError(payload.error ?? `HTTP_${res.status}`);
  }
  return payload as unknown as T;
}

export async function createLiveSession(input: CreateLiveSessionInput): Promise<LiveSessionRow> {
  const { session } = await invokeLiveSessions<{ session: LiveSessionRow }>({
    action: "create",
    ...input,
  });
  return session;
}

export async function updateLiveSession(input: {
  session_id: string;
  title?: string;
  description?: string | null;
  scheduled_start_at?: string;
  duration_minutes?: number;
  recording_enabled?: boolean;
}): Promise<LiveSessionRow> {
  const { session } = await invokeLiveSessions<{ session: LiveSessionRow }>({
    action: "update",
    ...input,
  });
  return session;
}

export async function cancelLiveSession(sessionId: string): Promise<void> {
  await invokeLiveSessions({ action: "cancel", session_id: sessionId });
}

export async function deleteLiveSession(sessionId: string): Promise<void> {
  await invokeLiveSessions({ action: "delete", session_id: sessionId });
}

export async function listZoomHosts(): Promise<ZoomHost[]> {
  const { hosts } = await invokeLiveSessions<{ hosts: ZoomHost[] }>({ action: "host_admins" });
  return hosts ?? [];
}

// ---------------------------------------------------------------------------
// Files (bucket `lesson-files`, prefix live/{session_id}/)
// ---------------------------------------------------------------------------
export const LIVE_FILES_MAX_BYTES = 200 * 1024 * 1024;

export function liveFilePath(sessionId: string, file: File): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = file.name.replace(/[^\w.\-\u0600-\u06FF]+/g, "_");
  return `live/${sessionId}/${random}-${safeName}`;
}

export async function uploadLiveSessionFile(
  sessionId: string,
  file: File,
  position: number,
): Promise<void> {
  const path = liveFilePath(sessionId, file);
  const { error: uploadError } = await supabase.storage
    .from("lesson-files")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) throw new Error("FILE_UPLOAD_FAILED");

  const { data: publicUrl } = supabase.storage.from("lesson-files").getPublicUrl(path);
  const { error } = await supabase.from("live_session_files").insert({
    session_id: sessionId,
    file_name: file.name,
    storage_path: publicUrl.publicUrl,
    file_type: file.type || null,
    file_size: file.size,
    allow_download: true,
    position,
  });
  if (error) throw new Error("FILE_RECORD_FAILED");
}

export async function deleteLiveSessionFile(fileId: string, storagePath: string): Promise<void> {
  const marker = "/lesson-files/";
  const idx = storagePath.indexOf(marker);
  if (idx >= 0) {
    const path = decodeURIComponent(storagePath.slice(idx + marker.length).split("?")[0]);
    await supabase.storage.from("lesson-files").remove([path]);
  }
  const { error } = await supabase.from("live_session_files").delete().eq("id", fileId);
  if (error) throw new Error("FILE_DELETE_FAILED");
}
