import { useState } from "react";
import { Film, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCairo } from "@/lib/cairo-time";
import { listRecordings, retryRecording, type RecordingRow } from "@/lib/live-media-api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ManualRecordingUpload from "./ManualRecordingUpload";

const TYPE_LABEL: Record<string, string> = {
  shared_screen_with_speaker_view: "الشاشة + المتحدث",
  "shared_screen_with_speaker_view(CC)": "الشاشة + المتحدث",
  speaker_view: "المتحدث",
  active_speaker: "المتحدث",
  gallery_view: "المعرض",
  shared_screen: "الشاشة",
  manual: "رفع يدوي",
};

const STATUS_META: Record<RecordingRow["status"], { label: string; className: string }> = {
  pending: { label: "في الانتظار", className: "bg-muted text-muted-foreground" },
  uploading: { label: "جارٍ النقل", className: "bg-primary/10 text-primary" },
  ready: { label: "جاهز", className: "bg-secondary text-secondary-foreground" },
  failed: { label: "فشل", className: "bg-destructive/15 text-destructive" },
  skipped: { label: "تم التخطي", className: "bg-muted text-muted-foreground" },
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

interface Props {
  sessionId: string;
  courseId: string;
  /** Basic-plan hosts cannot have cloud recordings. */
  hostIsBasic?: boolean;
}

const LiveRecordingsTab = ({ sessionId, courseId, hostIsBasic }: Props) => {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState<string | null>(null);

  const { data, isLoading } = useQuery<RecordingRow[]>({
    queryKey: ["live-media", "recordings", sessionId],
    queryFn: () => listRecordings(sessionId),
    // Keep polling while anything is still moving.
    refetchInterval: (query) => {
      const rows = query.state.data as RecordingRow[] | undefined;
      return rows?.some((r) => r.status === "pending" || r.status === "uploading") ? 10_000 : false;
    },
    retry: false,
  });

  const rows = data ?? [];

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      await retryRecording(id);
      await queryClient.invalidateQueries({ queryKey: ["live-media", "recordings", sessionId] });
    } catch {
      toast.error("تعذّرت إعادة المحاولة");
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">تسجيلات الجلسة</h3>
        <ManualRecordingUpload
          sessionId={sessionId}
          trigger={
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4" /> رفع تسجيل يدوي
            </Button>
          }
          onDone={() =>
            queryClient.invalidateQueries({ queryKey: ["live-media", "recordings", sessionId] })
          }
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10">
          <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Film className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="font-semibold">لا توجد تسجيلات بعد</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {hostIsBasic
              ? "الحساب المجاني لا يدعم التسجيل السحابي — ارفع التسجيل يدوياً"
              : "ستظهر التسجيلات تلقائياً بعد انتهاء الاجتماع بدقائق"}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const meta = STATUS_META[r.status];
            return (
              <li key={r.id} className="rounded-xl border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">
                      الجزء {r.part_index ?? "—"}
                      <span className="ms-2 text-xs font-normal text-muted-foreground">
                        {r.source === "manual_upload"
                          ? TYPE_LABEL.manual
                          : TYPE_LABEL[r.recording_type ?? ""] ?? r.recording_type ?? ""}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatSize(r.file_size)}
                      {r.recording_start && ` · ${formatCairo(r.recording_start, "time")}`}
                      {r.recording_end && ` – ${formatCairo(r.recording_end, "time")}`}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}
                  >
                    {meta.label}
                  </span>
                </div>

                {r.status === "uploading" && (
                  <Progress
                    value={
                      r.file_size ? Math.min(100, ((r.bytes_done ?? 0) / r.file_size) * 100) : 0
                    }
                  />
                )}

                {r.status === "failed" && (
                  <div className="space-y-1.5">
                    {r.last_error && (
                      <p className="text-xs text-destructive break-all">{r.last_error}</p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retry(r.id)}
                      disabled={retrying === r.id}
                    >
                      {retrying === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      إعادة المحاولة
                    </Button>
                  </div>
                )}

                {r.status === "ready" && r.lesson_id && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/courses/${courseId}/learn/lesson/${r.lesson_id}`}>فتح الدرس</a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LiveRecordingsTab;
