import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import type { AiUsageSnapshot } from "@/lib/ai-api";

function barColor(pct: number) {
  if (pct > 90) return "bg-destructive";
  if (pct >= 70) return "bg-accent";
  return "bg-primary";
}

const WINDOWS: { key: keyof AiUsageSnapshot["used"]; label: string }[] = [
  { key: "hour", label: "هذه الساعة" },
  { key: "day", label: "اليوم" },
  { key: "month", label: "هذا الشهر" },
];

/** Three platform-quota meters (hour / day / month). */
const UsageMeters = ({ usage }: { usage: AiUsageSnapshot }) => (
  <div className="grid gap-4 sm:grid-cols-3">
    {WINDOWS.map(({ key, label }) => {
      const used = usage.used[key];
      const limit = usage.limits[key];
      const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
      return (
        <div key={key} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
            <span className="text-3xl font-bold">{used}</span>
            <span className="text-muted-foreground">/ {limit}</span>
          </div>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${used} من ${limit}`}
          >
            <div className={`h-full rounded-full transition-all ${barColor(pct)}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            يُعاد الضبط خلال {formatDistanceToNowStrict(new Date(usage.resets[key]), { locale: ar })}
          </div>
        </div>
      );
    })}
  </div>
);

export default UsageMeters;
