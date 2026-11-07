import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { openExternalAfter } from "@/lib/open-external";
import { liveErrorMessage, replaceLiveSessionLink, type ReplaceReason } from "@/lib/live-sessions-api";

const REASONS: { value: ReplaceReason; label: string }[] = [
  { value: "disconnect", label: "انقطاع الاتصال" },
  { value: "time_limit", label: "انتهاء مدة الـ 40 دقيقة" },
  { value: "technical", label: "مشكلة تقنية" },
  { value: "other", label: "سبب آخر" },
];

const ZOOM_URL = /^https:\/\/([a-z0-9-]+\.)?zoom\.us\/(j|w|my)\/[A-Za-z0-9?=&._-]+$/;

interface Props {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

const ReplaceLinkDialog = ({ sessionId, open, onOpenChange, onDone }: Props) => {
  const [mode, setMode] = useState<"zoom_new" | "manual">("zoom_new");
  const [manualUrl, setManualUrl] = useState("");
  const [reason, setReason] = useState<ReplaceReason>("disconnect");
  const [busy, setBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const submit = async () => {
    setUrlError(null);
    if (mode === "manual" && !ZOOM_URL.test(manualUrl.trim())) {
      setUrlError("رابط Zoom غير صالح");
      return;
    }

    setBusy(true);
    try {
      // Pre-open the host tab before awaiting, so the popup is not blocked.
      const result = await openExternalAfter(async () => {
        const res = await replaceLiveSessionLink({
          session_id: sessionId,
          mode,
          manual_url: mode === "manual" ? manualUrl.trim() : undefined,
          reason,
        });
        return res.start_url;
      });

      if (result.blocked && result.url) window.location.href = result.url;
      toast.success("تم تحديث الرابط وإشعار الطلاب");
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(liveErrorMessage(e instanceof Error ? e.message : null));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>استبدال رابط الاجتماع</DialogTitle>
          <DialogDescription>
            استخدم هذا الخيار إذا انقطع الاجتماع أو انتهت مدة الـ 40 دقيقة. سيظهر للطلاب الحاضرين
            تنبيه فوري للانضمام بالرابط الجديد.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "zoom_new" | "manual")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="zoom_new">اجتماع Zoom جديد تلقائياً</TabsTrigger>
              <TabsTrigger value="manual">لصق رابط يدوي</TabsTrigger>
            </TabsList>

            <TabsContent value="zoom_new" className="pt-3 text-sm text-muted-foreground">
              سيُنشأ اجتماع فوري على حساب المضيف ويُفتح لك مباشرة.
            </TabsContent>

            <TabsContent value="manual" className="pt-3 space-y-2">
              <Label htmlFor="manual-url">رابط الاجتماع</Label>
              <Input
                id="manual-url"
                dir="ltr"
                placeholder="https://zoom.us/j/..."
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                disabled={busy}
              />
              {urlError && <p className="text-xs text-destructive">{urlError}</p>}
              <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  الروابط اليدوية لا تُسجَّل تلقائياً — ارفع التسجيل يدوياً بعد الجلسة.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>

          <div className="space-y-1.5">
            <Label>السبب</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as ReplaceReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ الاستبدال…
              </>
            ) : (
              "استبدال وإشعار الطلاب"
            )}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReplaceLinkDialog;
