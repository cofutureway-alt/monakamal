import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { formatCairo } from "@/lib/cairo-time";
import { cairoDate, cairoKey } from "@/lib/calendar";
import {
  cancelLiveSession,
  deleteLiveSession,
  listAdminRange,
  listZoomHosts,
  liveErrorMessage,
  type RangeLiveSession,
} from "@/lib/live-sessions-api";
import { supabase } from "@/integrations/supabase/client";
import LiveStatusPill from "@/components/live/LiveStatusPill";
import LiveSessionAdminCard from "@/components/live/LiveSessionAdminCard";
import LiveSessionFormModal from "@/components/live/LiveSessionFormModal";
import { toast } from "sonner";

/** Route: /admin/live-sessions — every session in a range, filterable. */
const AdminLiveSessions = () => {
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [hosts, setHosts] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [course, setCourse] = useState("all");
  const [host, setHost] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState(() => {
    const d = cairoDate(Date.now());
    return cairoKey(d);
  });
  const [to, setTo] = useState(() => {
    const d = new Date(Date.now() + 30 * 86_400_000);
    return cairoKey(cairoDate(d));
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RangeLiveSession | null>(null);
  const [newCourseId, setNewCourseId] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from("courses")
      .select("id, title")
      .order("title")
      .then(({ data }) => setCourses((data ?? []) as { id: string; title: string }[]));
    void listZoomHosts()
      .then((list) => setHosts(list.map((h) => ({ user_id: h.user_id, full_name: h.full_name }))))
      .catch(() => setHosts([]));
  }, []);

  const bounds = useMemo(() => {
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    return {
      fromIso: new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0)).toISOString(),
      toIso: new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59)).toISOString(),
    };
  }, [from, to]);

  const query = useQuery<RangeLiveSession[]>({
    queryKey: ["live-admin-sessions", from, to, course, host, status],
    queryFn: () =>
      listAdminRange(bounds.fromIso, bounds.toIso, {
        course: course === "all" ? null : course,
        host: host === "all" ? null : host,
        status: status === "all" ? null : status,
      }),
    staleTime: 30_000,
  });

  const rows = query.data ?? [];

  const cancel = async (id: string) => {
    try {
      await cancelLiveSession(id);
      toast.success("تم إلغاء الجلسة");
      void query.refetch();
    } catch (e) {
      toast.error(liveErrorMessage(e instanceof Error ? e.message : null));
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteLiveSession(id);
      toast.success("تم حذف الجلسة");
      void query.refetch();
    } catch (e) {
      toast.error(liveErrorMessage(e instanceof Error ? e.message : null));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">الجلسات المباشرة</h1>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> جدولة جلسة
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-40"
          aria-label="من"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-40"
          aria-label="إلى"
        />
        <Select value={course} onValueChange={setCourse}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="الدورة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الدورات</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={host} onValueChange={setHost}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="المضيف" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المضيفين</SelectItem>
            {hosts.map((h) => (
              <SelectItem key={h.user_id} value={h.user_id}>
                {h.full_name ?? h.user_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="scheduled">مجدولة</SelectItem>
            <SelectItem value="live">مباشر</SelectItem>
            <SelectItem value="ended">انتهت</SelectItem>
            <SelectItem value="completed">مكتملة</SelectItem>
            <SelectItem value="cancelled">ملغاة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-muted-foreground">
          لا توجد جلسات في هذه الفترة
        </div>
      ) : (
        <>
          {/* Table on md+, cards below */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border/60 bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-semibold">الموعد</th>
                  <th className="p-3 text-start font-semibold">الجلسة</th>
                  <th className="p-3 text-start font-semibold">الدورة</th>
                  <th className="p-3 text-start font-semibold">المضيف</th>
                  <th className="p-3 text-start font-semibold">الحالة</th>
                  <th className="p-3 text-start font-semibold">الأجزاء</th>
                  <th className="p-3 text-start font-semibold">الحضور</th>
                  <th className="p-3 text-start font-semibold">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-border/60">
                    <td className="p-3 whitespace-nowrap tabular-nums">
                      {formatCairo(s.scheduled_start_at, "datetime")}
                    </td>
                    <td className="p-3 font-semibold">{s.title}</td>
                    <td className="p-3 text-muted-foreground">{s.course_title}</td>
                    <td className="p-3 text-muted-foreground">{s.host_name ?? "—"}</td>
                    <td className="p-3">
                      <LiveStatusPill status={s.status} size="xs" />
                    </td>
                    <td className="p-3 tabular-nums">{s.segment_count ?? 0}</td>
                    <td className="p-3 tabular-nums">{s.attendee_count ?? 0}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setEditing(s); setFormOpen(true); }}>
                          تعديل
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => cancel(s.id)}>
                          إلغاء
                        </Button>
                        {(s.status === "scheduled" || s.status === "cancelled") && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s.id)}>
                            حذف
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {rows.map((s) => (
              <LiveSessionAdminCard
                key={s.id}
                session={{
                  id: s.id,
                  course_id: s.course_id,
                  unit_id: s.unit_id,
                  title: s.title,
                  scheduled_start_at: s.scheduled_start_at,
                  duration_minutes: s.duration_minutes,
                  status: s.status,
                  host_user_id: s.host_user_id,
                  link_version: s.link_version,
                  position: 0,
                  host_name: s.host_name,
                  attendee_count: s.attendee_count,
                }}
                courseId={s.course_id}
                onRefresh={() => void query.refetch()}
                onEdit={() => { setEditing(s); setFormOpen(true); }}
                onCancel={() => void cancel(s.id)}
                onDelete={() => void remove(s.id)}
              />
            ))}
          </div>
        </>
      )}

      {editing && (
        <LiveSessionFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          courseId={editing.course_id}
          target={{ unitId: editing.unit_id, row: {
            id: editing.id,
            course_id: editing.course_id,
            unit_id: editing.unit_id,
            title: editing.title,
            scheduled_start_at: editing.scheduled_start_at,
            duration_minutes: editing.duration_minutes,
            status: editing.status,
            host_user_id: editing.host_user_id,
            link_version: editing.link_version,
            position: 0,
          } }}
          onSaved={() => void query.refetch()}
        />
      )}

      {/* Creating needs a course first: the form is per-course. */}
      <Dialog open={!editing && formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>جدولة جلسة مباشرة</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>الدورة*</Label>
            <Select
              value={newCourseId}
              onValueChange={(v) => {
                setNewCourseId(v);
                setFormOpen(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الدورة" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!editing && newCourseId && !formOpen && (
        <LiveSessionFormModal
          open={Boolean(newCourseId)}
          onOpenChange={(v) => !v && setNewCourseId(null)}
          courseId={newCourseId}
          target={{ unitId: null }}
          onSaved={() => {
            setNewCourseId(null);
            void query.refetch();
          }}
        />
      )}
    </div>
  );
};

export default AdminLiveSessions;
