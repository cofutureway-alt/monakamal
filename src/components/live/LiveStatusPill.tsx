import { CheckCircle2 } from "lucide-react";
import type { LiveSessionStatus } from "@/lib/live-sessions-api";

const STYLES: Record<LiveSessionStatus, { label: string; className: string }> = {
  scheduled: { label: "مجدولة", className: "bg-primary/10 text-primary" },
  live: { label: "مباشر", className: "bg-destructive/15 text-destructive" },
  ended: { label: "انتهت", className: "bg-muted text-muted-foreground" },
  completed: { label: "مكتملة", className: "bg-secondary text-secondary-foreground" },
  cancelled: { label: "ملغاة", className: "bg-muted text-muted-foreground line-through" },
};

interface Props {
  status: LiveSessionStatus;
  size?: "xs" | "sm";
  className?: string;
}

const LiveStatusPill = ({ status, size = "sm", className = "" }: Props) => {
  const meta = STYLES[status] ?? STYLES.scheduled;
  const sizing = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${sizing} ${meta.className} ${className}`}
    >
      {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {status === "completed" && <CheckCircle2 className="h-3 w-3" />}
      {meta.label}
    </span>
  );
};

export default LiveStatusPill;
