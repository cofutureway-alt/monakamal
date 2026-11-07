import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const config = {
  student: { label: "الطلاب", color: "var(--primary)" },
  parent: { label: "أولياء الأمور", color: "var(--accent)" },
  // Mid-tone of primary: distinct from students in both light and dark themes.
  guest: { label: "الزوار", color: "color-mix(in oklch, var(--primary) 45%, var(--background))" },
  admin: { label: "الإدارة", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

type ActorKey = keyof typeof config;

interface Row {
  day: string;
  actor_type: string;
  count: number;
}

/** 30-day stacked usage by actor type. */
const UsageChart = ({ rows }: { rows: Row[] }) => {
  const data = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
      byDay.set(key, { day: key, student: 0, parent: 0, guest: 0, admin: 0 });
    }
    for (const r of rows) {
      const slot = byDay.get(r.day);
      if (slot && r.actor_type in config) slot[r.actor_type] = Number(slot[r.actor_type] ?? 0) + Number(r.count);
    }
    return [...byDay.values()];
  }, [rows]);

  const total = rows.reduce((s, r) => s + Number(r.count), 0);

  if (!total) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="rounded-full bg-muted p-4">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">لا يوجد استخدام بعد</p>
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="h-64 w-full" dir="ltr">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) =>
            new Date(`${v}T12:00:00`).toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short" })
          }
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {(Object.keys(config) as ActorKey[]).map((k, i, arr) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="u"
            fill={`var(--color-${k})`}
            radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
};

export default UsageChart;
