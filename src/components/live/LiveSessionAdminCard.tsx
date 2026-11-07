import { Copy, Files, MoreVertical, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCairo } from "@/lib/cairo-time";
import { liveErrorMessage, type LiveSessionRow } from "@/lib/live-sessions-api";
import LiveStatusPill from "./LiveStatusPill";

export interface AdminSessionView extends LiveSessionRow {
  host_name?: string | null;
  file_count?: number;
}

interface Props {
  session: AdminSessionView;
  courseId: string;
  onEdit: (session: AdminSessionView) => void;
  onCancel: (session: AdminSessionView) => void;
  onDelete: (session: AdminSessionView) => void;
}

const LiveSessionAdminCard = ({ session, courseId, onEdit, onCancel, onDelete }: Props) => {
  const start = new Date(session.scheduled_start_at);
  const dayNumber = formatCairo(start, "date").split(" ")[0];
  const shortMonth = formatCairo(start, "monthYear").split(" ")[0];
  const deletable = session.status === "scheduled" || session.status === "cancelled";

  const copyPageLink = async () => {
    const url = `${window.location.origin}/courses/${courseId}/learn/live_session/${session.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ رابط صفحة الجلسة");
    } catch {
      toast.error(liveErrorMessage("UNKNOWN"));
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-3 md:p-4">
      <div className="w-14 shrink-0 rounded-xl bg-primary/10 text-primary text-center py-1.5">
        <div className="text-xl font-bold leading-tight">{dayNumber}</div>
        <div className="text-[10px] leading-tight">{shortMonth}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold truncate">{session.title}</span>
          <LiveStatusPill status={session.status} size="xs" />
        </div>
        <div className="mt-1 text-xs text-muted-foreground truncate">
          {formatCairo(start, "time")} · {session.duration_minutes} دقيقة
          {session.host_name ? ` · المضيف: ${session.host_name}` : ""}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                {/* TODO(phase4): start / replace-link actions land in Phase 4. */}
                <Button size="sm" variant="outline" disabled>
                  <Radio className="h-4 w-4" /> ابدأ الجلسة
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>سيتم تفعيله في مرحلة لاحقة</TooltipContent>
          </Tooltip>
          {(session.file_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              <Files className="h-3 w-3" /> {session.file_count}
            </span>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="خيارات الجلسة">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(session)}>تعديل</DropdownMenuItem>
          <DropdownMenuItem onClick={copyPageLink}>
            <Copy className="h-4 w-4" /> نسخ رابط صفحة الجلسة
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => onCancel(session)}>
            إلغاء الجلسة
          </DropdownMenuItem>
          {deletable && (
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(session)}>
              حذف
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default LiveSessionAdminCard;
