import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Lock,
  PlayCircle,
  Radio,
} from "lucide-react";
import LiveStatusPill from "@/components/live/LiveStatusPill";
import type { LiveSessionStatus } from "@/lib/live-sessions-api";
import type { ContentItem, ContentItemType } from "@/hooks/use-unit-content-items";

const TYPE_META: Record<
  ContentItemType,
  { icon: typeof PlayCircle; label: string }
> = {
  lesson: { icon: PlayCircle, label: "درس" },
  quiz: { icon: ClipboardCheck, label: "اختبار" },
  assignment: { icon: ClipboardList, label: "واجب" },
  live_session: { icon: Radio, label: "جلسة مباشرة" },
};

interface Props {
  item: ContentItem;
  isCurrent: boolean;
  onNavigate?: () => void;
}

const ContentSidebarItem = ({ item, isCurrent, onNavigate }: Props) => {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const isDone = item.isCompleted;
  const isLocked = item.isLocked;

  const lockHint =
    item.lockReason === "quiz_gate"
      ? `يفتح بعد اجتياز: ${item.gateQuizTitle ?? "اختبار سابق"}`
      : item.lockReason === "drip"
        ? "أكمل العنصر السابق أولاً"
        : "";

  const inner = (
    <>
      {isCurrent && !isLocked && (
        <motion.span
          layoutId="content-active-indicator"
          className="absolute inset-y-1 right-0 w-1 rounded-full bg-primary"
        />
      )}
      <div
        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
          isLocked
            ? "bg-muted text-muted-foreground"
            : isDone
              ? "bg-emerald-500 text-white"
              : isCurrent
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
        }`}
      >
        {isLocked ? (
          <motion.span
            animate={{ rotate: [0, -8, 8, 0] }}
            transition={{ duration: 0.6, repeat: 0 }}
          >
            <Lock className="w-3.5 h-3.5" />
          </motion.span>
        ) : isDone ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <Icon className={`w-4 h-4 ${isCurrent ? "" : "opacity-70"}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`truncate font-medium ${isLocked ? "text-muted-foreground" : ""}`}>
          {item.title}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {isLocked ? (
            <span className="text-amber-600 dark:text-amber-400">{lockHint}</span>
          ) : (
            <>
              {meta.label}
              {item.type === "quiz" && item.extra?.durationMinutes != null && (
                <> · {item.extra.durationMinutes} د</>
              )}
              {item.type === "live_session" && item.extra?.status && (
                <span className="ms-1.5 inline-flex align-middle">
                  <LiveStatusPill status={item.extra.status as LiveSessionStatus} size="xs" />
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );

  if (isLocked) {
    return (
      <div
        title={lockHint}
        aria-disabled="true"
        className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm opacity-70 cursor-not-allowed"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      to={item.routePath}
      onClick={onNavigate}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        isCurrent
          ? "bg-primary/10 text-foreground"
          : "hover:bg-accent text-foreground/80"
      }`}
    >
      {inner}
    </Link>
  );
};

export default ContentSidebarItem;
