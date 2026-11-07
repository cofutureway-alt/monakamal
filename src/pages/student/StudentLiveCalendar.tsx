import LiveCalendar from "@/components/live/LiveCalendar";

/** Route: /dashboard/calendar */
const StudentLiveCalendar = () => (
  <div className="max-w-6xl mx-auto space-y-5">
    <div>
      <h1 className="text-2xl md:text-3xl font-bold">تقويم الجلسات المباشرة</h1>
      <p className="text-sm text-muted-foreground mt-1">جميع المواعيد بتوقيت القاهرة</p>
    </div>
    <LiveCalendar mode="student" />
  </div>
);

export default StudentLiveCalendar;
