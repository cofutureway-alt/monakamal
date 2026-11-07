import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { AiApiError, requestPlanChange, type AiPlan, type PlanChangeRequest } from "@/lib/ai-api";

const TAGS: Record<string, string | null> = { base: null, tier2: "+50%", tier3: "+150%" };

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

interface Props {
  plans: AiPlan[];
  currentPlanId: string;
  pending: PlanChangeRequest[];
  onRequested: () => void;
}

const PlanCards = ({ plans, currentPlanId, pending, onRequested }: Props) => {
  const [target, setTarget] = useState<AiPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await requestPlanChange(target.id);
      toast.success("تم إرسال طلب الترقية");
      onRequested();
      setTarget(null);
    } catch (e) {
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.id === currentPlanId;
          const requested = pending.some((r) => r.to_plan === p.id);
          return (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-2xl border bg-card p-5 shadow-sm ${
                current ? "border-primary ring-2 ring-primary" : "border-border/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">{p.name_ar}</h3>
                {current ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">باقتك الحالية</span>
                ) : (
                  TAGS[p.id] && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent" dir="ltr">
                      {TAGS[p.id]}
                    </span>
                  )
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums" dir="ltr">{usd(p.price_usd_cents)}</span>
                <span className="text-sm text-muted-foreground">/ شهرياً</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  `${p.per_hour} رسالة / ساعة`,
                  `${p.per_day} رسالة / يوم`,
                  `${p.per_month.toLocaleString("ar-EG")} رسالة / شهر`,
                ].map((line) => (
                  <li key={line} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span className="tabular-nums">{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-5">
                {!current && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={requested}
                    onClick={() => setTarget(p)}
                  >
                    {requested ? "تم إرسال الطلب" : "طلب الترقية"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={Boolean(target)} onOpenChange={(v) => !v && setTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد طلب الترقية</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إرسال طلب ترقية إلى {target?.name_ar} بسعر {target ? usd(target.price_usd_cents) : ""} شهرياً لمالك المنصة للموافقة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              إرسال الطلب
            </AlertDialogAction>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PlanCards;
