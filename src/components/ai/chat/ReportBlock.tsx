import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ReportBlock as Block } from "@/lib/ai-api";

const SERIES_COLORS = ["var(--primary)", "var(--accent)", "var(--secondary-foreground)", "var(--muted-foreground)"];

function exportCsv(block: Block) {
  const rows: (string | number)[][] = [];
  if (block.table) rows.push(block.table.columns, ...block.table.rows);
  else {
    rows.push(["المؤشر", "القيمة"]);
    for (const k of block.kpis) rows.push([k.label, `${k.value}${k.unit ? ` ${k.unit}` : ""}`]);
  }
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(block.title ?? "report").replace(/[\\/:*?"<>|]+/g, "")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** KPI tiles + optional chart + optional table, rendered from tool data (never model-authored). */
const ReportBlock = ({ block }: { block: Block }) => {
  const chart = block.chart;
  const data = chart ? chart.x.map((x, i) => Object.fromEntries([["x", x], ...chart.series.map((s, j) => [`s${j}`, s.data[i] ?? 0])])) : [];
  const config: ChartConfig = Object.fromEntries((chart?.series ?? []).map((s, j) => [`s${j}`, { label: s.name, color: SERIES_COLORS[j % SERIES_COLORS.length] }]));

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        {block.title && <h4 className="font-bold">{block.title}</h4>}
        <Button size="sm" variant="outline" className="ms-auto" onClick={() => exportCsv(block)}>
          <Download className="h-4 w-4" /> تصدير CSV
        </Button>
      </div>

      <div className={`grid gap-3 ${block.kpis.length >= 4 ? "grid-cols-2 md:grid-cols-4" : block.kpis.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {block.kpis.map((k) => (
          <div key={k.label} className="rounded-xl bg-secondary p-3">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {typeof k.value === "number" ? k.value.toLocaleString("en-US") : k.value}
              {k.unit && <span className="ms-1 text-sm font-medium text-muted-foreground">{k.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {chart && data.length > 0 && (
        <ChartContainer config={config} className="h-56 w-full" dir="ltr">
          {chart.type === "line" ? (
            <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {chart.series.map((_, j) => (
                <Line key={j} dataKey={`s${j}`} type="monotone" stroke={`var(--color-s${j})`} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="x"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
                tickFormatter={(v: string) => (String(v).length > 14 ? `${String(v).slice(0, 13)}…` : v)}
              />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {chart.series.map((_, j) => (
                <Bar key={j} dataKey={`s${j}`} fill={`var(--color-s${j})`} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ChartContainer>
      )}

      {block.table && block.table.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                {block.table.columns.map((c) => (
                  <th key={c} className="px-2 py-2 text-start font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.table.rows.map((r, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-2 tabular-nums">{typeof c === "number" ? c.toLocaleString("en-US") : c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportBlock;
