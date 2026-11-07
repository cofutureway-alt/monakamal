import { supabase } from "@/integrations/supabase/client";

export interface ZoomConnection {
  user_id: string;
  zoom_user_id: string;
  zoom_email: string | null;
  zoom_display_name: string | null;
  zoom_account_type: number | null;
  scopes: string[];
  status: "active" | "revoked";
  connected_at: string;
  updated_at: string;
}

/** POST /zoom-oauth/start → authorize URL to send the browser to. */
export async function startZoomConnect(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("zoom-oauth/start", { method: "POST" });
  if (error) throw new Error("ZOOM_START_FAILED");
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error("ZOOM_START_FAILED");
  return url;
}

/** POST /zoom-oauth/status → the caller's connection row (or null). */
export async function getZoomStatus(): Promise<ZoomConnection | null> {
  const { data, error } = await supabase.functions.invoke("zoom-oauth/status", { method: "POST" });
  if (error) throw new Error("ZOOM_STATUS_FAILED");
  return ((data as { connection?: ZoomConnection | null })?.connection ?? null);
}

/** POST /zoom-oauth/disconnect → revokes at Zoom and deletes local tokens. */
export async function disconnectZoom(): Promise<void> {
  const { error } = await supabase.functions.invoke("zoom-oauth/disconnect", { method: "POST" });
  if (error) throw new Error("ZOOM_DISCONNECT_FAILED");
}
