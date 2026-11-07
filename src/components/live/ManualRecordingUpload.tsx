import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { completeUpload, putFileToR2, requestUploadUrl } from "@/lib/live-media-api";

const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB

interface Props {
  sessionId: string;
  trigger: React.ReactNode;
  onDone: () => void;
}

/** Uploads one MP4 straight to private R2 through a signed PUT URL. */
const ManualRecordingUpload = ({ sessionId, trigger, onDone }: Props) => {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [startTime, setStartTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const xhrAbort = useRef<null | (() => void)>(null);
  const startedAt = useRef(0);

  const pick = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (f.type !== "video/mp4") {
      toast.error("يُقبل ملف MP4 فقط");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("الحد الأقصى 5 جيجابايت");
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setSpeed(0);
    startedAt.current = Date.now();

    try {
      const target = await requestUploadUrl({
        session_id: sessionId,
        file_name: file.name,
        file_size: file.size,
        content_type: file.type || "video/mp4",
      });

      await putFileToR2(
        target,
        file,
        (loaded) => {
          setProgress(Math.round((loaded / file.size) * 100));
          const secs = (Date.now() - startedAt.current) / 1000;
          setSpeed(secs > 0 ? loaded / (1024 * 1024) / secs : 0);
        },
        (abort) => {
          xhrAbort.current = abort;
        },
      );

      // `startTime` is a wall-clock time on the session's day; part ordering uses it.
      const iso = startTime
        ? new Date(`${new Date().toISOString().slice(0, 10)}T${startTime}:00`).toISOString()
        : null;
      await completeUpload(target.recording_id, iso);

      toast.success("تم رفع التسجيل");
      setOpen(false);
      setFile(null);
      setStartTime("");
      onDone();
    } catch (e) {
      if (e instanceof Error && e.message === "UPLOAD_ABORTED") toast.error("تم إلغاء الرفع");
      else toast.error("تعذّر رفع التسجيل");
    } finally {
      setBusy(false);
      xhrAbort.current = null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>رفع تسجيل يدوي</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border p-6 text-center cursor-pointer hover:bg-muted/40">
            <input
              type="file"
              accept="video/mp4"
              className="hidden"
              disabled={busy}
              onChange={(e) => pick(e.target.files)}
            />
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {file ? file.name : "اختر ملف MP4 (حتى 5 جيجابايت)"}
            </span>
            {file && (
              <span className="text-xs text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(1)} م.ب
              </span>
            )}
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="rec-start">وقت بداية التسجيل (اختياري)</Label>
            <Input
              id="rec-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              يُستخدم لترتيب الأجزاء. افتراضياً وقت الرفع.
            </p>
          </div>

          {busy && (
            <div className="space-y-1.5">
              <Progress value={progress} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress}%</span>
                <span>{speed.toFixed(1)} م.ب/ث</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {busy ? (
            <Button
              variant="outline"
              onClick={() => xhrAbort.current?.()}
            >
              <X className="h-4 w-4" /> إلغاء الرفع
            </Button>
          ) : (
            <Button onClick={upload} disabled={!file}>
              <Upload className="h-4 w-4" /> رفع
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            إغلاق
          </Button>
        </DialogFooter>

        {busy && (
          <p className="text-center text-xs text-muted-foreground">
            <Loader2 className="inline h-3 w-3 animate-spin" /> جارٍ الرفع…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ManualRecordingUpload;
