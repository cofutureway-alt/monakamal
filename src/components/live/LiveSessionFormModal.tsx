import { useEffect, useState } from "react";
import { CalendarIcon, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { ar } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  cairoLocalToUtc,
  cairoParts,
  CAIRO_WEEK_START,
  formatCairo,
} from "@/lib/cairo-time";
import {
  createLiveSession,
  LIVE_FILES_MAX_BYTES,
  listZoomHosts,
  updateLiveSession,
  uploadLiveSessionFile,
  type LiveSessionRow,
  type ZoomHost,
} from "@/lib/live-sessions-api";
import { liveErrorMessage } from "@/lib/live-sessions-api";

const DURATIONS = [30, 40, 45, 60, 90, 120, 180];
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

export interface LiveSessionFormTarget {
  id?: string;
  unitId: string | null;
  createUnitTitle?: string | null;
  row?: LiveSessionRow;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle?: string;
  target: LiveSessionFormTarget;
  onSaved: () => void;
}

/** A wall-clock pick split into the three selects the spec requires. */
interface CairoWallClock {
  date: Date;
  hour12: number;
  minute: number;
  meridiem: "am" | "pm";
}

function toWallClock(date: Date): CairoWallClock {
  const p = cairoParts(date);
  return {
    date: new Date(p.year, p.month - 1, p.day),
    hour12: p.hour % 12 === 0 ? 12 : p.hour % 12,
    minute: Math.floor(p.minute / 5) * 5,
    meridiem: p.hour >= 12 ? "pm" : "am",
  };
}

function wallClockToUtc(w: CairoWallClock): Date {
  const hour24 =
    w.meridiem === "am" ? (w.hour12 === 12 ? 0 : w.hour12) : w.hour12 === 12 ? 12 : w.hour12 + 12;
  return cairoLocalToUtc(
    w.date.getFullYear(),
    w.date.getMonth() + 1,
    w.date.getDate(),
    hour24,
    w.minute,
  );
}

const LiveSessionFormModal = ({
  open,
  onOpenChange,
  courseId,
  target,
  onSaved,
}: Props) => {
  const { user } = useAuth();
  const editing = Boolean(target.row);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clock, setClock] = useState<CairoWallClock>(() => toWallClock(new Date(Date.now() + 3_600_000)));
  const [duration, setDuration] = useState(60);
  const [hostId, setHostId] = useState<string>("");
  const [recording, setRecording] = useState(true);
  const [hosts, setHosts] = useState<ZoomHost[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFiles([]);

    if (target.row) {
      setTitle(target.row.title);
      setDescription("");
      setDuration(target.row.duration_minutes);
      setHostId(target.row.host_user_id);
      setRecording(true);
      setClock(toWallClock(new Date(target.row.scheduled_start_at)));
    } else {
      setTitle("");
      setDescription("");
      setDuration(60);
      setRecording(true);
      setClock(toWallClock(new Date(Date.now() + 3_600_000)));
    }

    listZoomHosts()
      .then((list) => {
        setHosts(list);
        if (!target.row) {
          const self = list.find((h) => h.user_id === user?.id);
          setHostId(self?.user_id ?? list[0]?.user_id ?? "");
        }
      })
      .catch(() => setHosts([]));
  }, [open, target.row?.id]);

  const selectedHost = hosts.find((h) => h.user_id === hostId);
  const isBasic = selectedHost?.zoom_account_type === 1;
  const startsAt = wallClockToUtc(clock);
  const tooSoon = startsAt.getTime() < Date.now() + 5 * 60_000;

  const previewText = `ستبدأ الجلسة ${formatCairo(startsAt, "weekday")} ${formatCairo(
    startsAt,
    "date",
  )} الساعة ${formatCairo(startsAt, "time")} بتوقيت القاهرة`;

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) return setError("العنوان مطلوب");
    if (!clock.date) return setError("اختر تاريخاً");
    if (tooSoon) return setError("يجب أن يكون الموعد بعد 5 دقائق على الأقل من الآن");
    if (!hostId) return setError("اختر المضيف");

    setSubmitting(true);
    try {
      let sessionId: string;
      if (target.row) {
        const row = await updateLiveSession({
          session_id: target.row.id,
          title: title.trim(),
          description: description.trim() || null,
          scheduled_start_at: startsAt.toISOString(),
          duration_minutes: duration,
          recording_enabled: recording,
        });
        sessionId = row.id;
      } else {
        const row = await createLiveSession({
          course_id: courseId,
          unit_id: target.unitId,
          create_unit_title: target.createUnitTitle ?? null,
          title: title.trim(),
          description: description.trim() || null,
          scheduled_start_at: startsAt.toISOString(),
          duration_minutes: duration,
          host_user_id: hostId,
          recording_enabled: recording,
        });
        sessionId = row.id;
      }

      // Files upload after the session exists (needs the id in the path).
      for (let i = 0; i < files.length; i++) {
        try {
          await uploadLiveSessionFile(sessionId, files[i], i);
        } catch {
          toast.error(`تعذّر رفع ${files[i].name}`);
        }
      }

      toast.success("تمت جدولة الجلسة وإشعار الطلاب");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "UNKNOWN";
      setError(liveErrorMessage(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => f.size <= LIVE_FILES_MAX_BYTES);
    if (accepted.length !== list.length) toast.error("بعض الملفات أكبر من 200 م.ب وتم تجاهلها");
    setFiles((prev) => [...prev, ...accepted]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل الجلسة" : "جدولة جلسة مباشرة"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="live-title">عنوان الجلسة*</Label>
            <Input
              id="live-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="live-desc">الوصف</Label>
            <Textarea
              id="live-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>التاريخ*</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="h-4 w-4" />
                    {formatCairo(clock.date, "date")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    locale={ar}
                    weekStartsOn={CAIRO_WEEK_START}
                    selected={clock.date}
                    disabled={{ before: new Date() }}
                    onSelect={(d) => d && setClock((prev) => ({ ...prev, date: d }))}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>المدة*</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} دقيقة
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>الوقت*</Label>
            <div className="grid grid-cols-3 gap-2">
              <Select
                value={String(clock.hour12)}
                onValueChange={(v) => setClock((p) => ({ ...p, hour12: Number(v) }))}
              >
                <SelectTrigger aria-label="الساعة">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={String(clock.minute).padStart(2, "0")}
                onValueChange={(v) => setClock((p) => ({ ...p, minute: Number(v) }))}
              >
                <SelectTrigger aria-label="الدقيقة">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={clock.meridiem}
                onValueChange={(v) => setClock((p) => ({ ...p, meridiem: v as "am" | "pm" }))}
              >
                <SelectTrigger aria-label="ص/م">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="am">ص</SelectItem>
                  <SelectItem value="pm">م</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{previewText}</p>
          </div>

          <div className="space-y-1.5">
            <Label>المضيف*</Label>
            {hosts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                لا يوجد حساب Zoom مرتبط.{" "}
                <a href="/admin/account" className="text-primary underline">
                  اربط حساب Zoom أولاً
                </a>
              </div>
            ) : (
              <Select value={hostId} onValueChange={setHostId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المضيف" />
                </SelectTrigger>
                <SelectContent>
                  {hosts.map((h) => (
                    <SelectItem key={h.user_id} value={h.user_id}>
                      {h.full_name ?? h.zoom_email ?? h.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-3">
            <div>
              <div className="text-sm font-medium">تسجيل سحابي تلقائي</div>
              {isBasic && (
                <div className="text-xs text-muted-foreground">غير متاح للحساب المجاني</div>
              )}
            </div>
            <Switch
              checked={recording}
              disabled={isBasic}
              onCheckedChange={setRecording}
              aria-label="تسجيل سحابي تلقائي"
            />
          </div>

          {isBasic && duration > 40 && (
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <AlertDescription>
                قد ينتهي الاجتماع بعد 40 دقيقة على الحساب المجاني. يمكنك استبدال الرابط أثناء الجلسة.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>ملفات الجلسة</Label>
            <label className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border p-6 text-center cursor-pointer hover:bg-muted/40">
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              <Plus className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">أضف ملفات (حتى 200 م.ب لكل ملف)</span>
            </label>
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(f.size / (1024 * 1024)).toFixed(1)} م.ب
                </span>
                <button
                  type="button"
                  aria-label="إزالة الملف"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting || hosts.length === 0}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ إنشاء اجتماع Zoom…
              </>
            ) : editing ? (
              "حفظ التعديلات"
            ) : (
              "جدولة الجلسة"
            )}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LiveSessionFormModal;
