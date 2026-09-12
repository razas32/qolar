"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { money } from "@/lib/format";

const config = {
  current: { label: "This month", color: "var(--chart-1)" },
  previous: { label: "Last month", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

type Pt = { day: number; value: number };

export function CumulativeChart({ current, previous, today }: { current: Pt[]; previous: Pt[]; today?: number }) {
  const prev = new Map(previous.map((p) => [p.day, p.value]));
  const data = current.map((c) => ({
    day: c.day,
    current: today !== undefined && c.day > today ? null : c.value,
    previous: prev.get(c.day) ?? null,
  }));
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} ticks={[1, 8, 15, 22, 29]} />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => `Day ${d}`} formatter={(v, n) => [money(Number(v)), n === "current" ? " This month" : " Last month"]} />} />
        <Line type="monotone" dataKey="previous" stroke="var(--color-previous)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls />
        <Line type="monotone" dataKey="current" stroke="var(--color-current)" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
