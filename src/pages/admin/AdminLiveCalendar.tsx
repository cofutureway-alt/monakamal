import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import LiveCalendar from "@/components/live/LiveCalendar";
import { listZoomHosts } from "@/lib/live-sessions-api";

/** Route: /admin/live-calendar */
const AdminLiveCalendar = () => {
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [hosts, setHosts] = useState<{ user_id: string; full_name: string | null }[]>([]);

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">تقويم البث المباشر</h1>
        <p className="text-sm text-muted-foreground mt-1">جميع المواعيد بتوقيت القاهرة</p>
      </div>
      <LiveCalendar
        mode="admin"
        courseOptions={courses}
        hostOptions={hosts}
        onEdit={(s) => {
          window.location.assign(`/admin/courses/${s.course_id}/builder`);
        }}
      />
    </div>
  );
};

export default AdminLiveCalendar;
