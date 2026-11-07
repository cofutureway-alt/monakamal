import { useEffect, useState } from "react";
import { Link2, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCairo } from "@/lib/cairo-time";
import { disconnectZoom, getZoomStatus, startZoomConnect, type ZoomConnection } from "@/lib/zoom-api";

const ZoomConnectCard = () => {
  const [connection, setConnection] = useState<ZoomConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let alive = true;
    getZoomStatus()
      .then((c) => alive && setConnection(c))
      .catch(() => alive && setConnection(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await startZoomConnect();
      window.location.assign(url);
    } catch {
      toast.error("تعذّر ربط حساب Zoom. حاول مرة أخرى.");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectZoom();
      setConnection(null);
      setConfirmOpen(false);
    } catch {
      toast.error("تعذّر إلغاء الربط. حاول مرة أخرى.");
    } finally {
      setDisconnecting(false);
    }
  };

  const initials = (connection?.zoom_display_name ?? connection?.zoom_email ?? "Z")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-sm p-5 md:p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 text-primary p-2.5">
          <Video className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">ربط حساب Zoom</h2>
          <p className="text-sm text-muted-foreground">
            اربط حسابك لإنشاء الجلسات المباشرة وتسجيلها تلقائياً.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ) : !connection ? (
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحويل إلى Zoom…
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" /> ربط Zoom
              </>
            )}
          </Button>
        ) : connection.status === "revoked" ? (
          <>
            <Alert variant="destructive">
              <AlertDescription>انتهت صلاحية الربط. يرجى إعادة ربط حساب Zoom.</AlertDescription>
            </Alert>
            <Button onClick={handleConnect} disabled={connecting}>
              <Link2 className="h-4 w-4" /> إعادة الربط
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">
                  {connection.zoom_display_name ?? "حساب Zoom"}
                </div>
                <div className="text-sm text-muted-foreground truncate">{connection.zoom_email}</div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  connection.zoom_account_type === 1
                    ? "bg-accent/15 text-accent"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {connection.zoom_account_type === 1 ? "حساب مجاني" : "حساب مرخّص"}
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              تاريخ الربط: {formatCairo(connection.connected_at, "date")}
            </p>

            {connection.zoom_account_type === 1 && (
              <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertDescription>
                  الحساب المجاني محدود بـ 40 دقيقة لكل اجتماع ولا يدعم التسجيل السحابي.
                </AlertDescription>
              </Alert>
            )}

            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setConfirmOpen(true)}
            >
              إلغاء الربط
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل تريد إلغاء ربط Zoom؟</AlertDialogTitle>
            <AlertDialogDescription>
              لن تتمكن من إنشاء جلسات جديدة حتى تعيد الربط.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDisconnect();
              }}
              disabled={disconnecting}
            >
              {disconnecting ? "جارٍ الإلغاء…" : "إلغاء الربط"}
            </AlertDialogAction>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default ZoomConnectCard;
