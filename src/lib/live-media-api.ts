import { supabase } from "@/integrations/supabase/client";

export interface PlaybackUrl {
  url: string;
  expires_at: string;
}

export interface RecordingRow {
  id: string;
  part_index: number | null;
  source: "zoom_cloud" | "manual_upload";
  recording_type: string | null;
  file_size: number | null;
  status: "pending" | "uploading" | "ready" | "failed" | "skipped";
  attempts: number;
  last_error: string | null;
  bytes_done: number | null;
  recording_start: string | null;
  recording_end: string | null;
  lesson_id: string | null;
  created_at: string;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? "";
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/live-media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok || payload.error) throw new Error(String(payload.error ?? `HTTP_${res.status}`));
  return payload as T;
}

/** A 4 h signed media URL for an `r2` lesson (enrolled students + admins). */
export function getPlaybackUrl(lessonId: string): Promise<PlaybackUrl> {
  return invoke<PlaybackUrl>({ action: "playback_url", lesson_id: lessonId });
}

export interface UploadTarget {
  recording_id: string;
  upload_url: string;
  content_type: string;
  file_name: string;
  expires_at: string;
}

export function requestUploadUrl(input: {
  session_id: string;
  file_name: string;
  file_size: number;
  content_type: string;
}): Promise<UploadTarget> {
  return invoke<UploadTarget>({ action: "upload_url", ...input });
}

export function completeUpload(recordingId: string, recordingStart?: string | null) {
  return invoke<{ ok: boolean; size: number }>({
    action: "upload_complete",
    recording_id: recordingId,
    recording_start: recordingStart ?? null,
  });
}

export function retryRecording(recordingId: string) {
  return invoke<{ ok: boolean }>({ action: "retry_recording", recording_id: recordingId });
}

export async function listRecordings(sessionId: string): Promise<RecordingRow[]> {
  const { recordings } = await invoke<{ recordings: RecordingRow[] }>({
    action: "list_recordings",
    session_id: sessionId,
  });
  return recordings ?? [];
}

/** PUT the file straight to R2 through the Worker, reporting progress. */
export function putFileToR2(
  target: UploadTarget,
  file: File,
  onProgress: (loaded: number) => void,
  registerAbort?: (abort: () => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.upload_url, true);
    xhr.setRequestHeader("Content-Type", target.content_type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`UPLOAD_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("UPLOAD_NETWORK"));
    xhr.onabort = () => reject(new Error("UPLOAD_ABORTED"));
    registerAbort?.(() => xhr.abort());
    xhr.send(file);
  });
}
