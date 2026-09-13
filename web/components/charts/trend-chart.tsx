"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { money } from "@/lib/format";

const config = {
  spent: { label: "Spent", color: "var(--chart-1)" },
  incomeBar: { label: "Income", color: "var(--chart-2)" },
} satisfies ChartConfig;

type Row = { month: string; spent: number; income: number };

const short = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-CA", { month: "short" });

export function TrendChart({ data, selected, linkBase }: { data: Row[]; selected: string; linkBase: string }) {
  const router = useRouter();
  const goToMonth = (month: string) => {
    const sep = linkBase.includes("?") ? "&" : "?";
    router.push(`${linkBase}${sep}month=${month}`);
  };
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart data={data} barCategoryGap={18} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="month" tickFormatter={short} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
        <YAxis hide />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent labelFormatter={(l) => short(String(l))} formatter={(v, n) => [money(Number(v)), n === "spent" ? " Spent" : " Income"]} />}
        />
        <Bar dataKey="spent" fill="var(--color-spent)" radius={[6, 6, 0, 0]} maxBarSize={36} onClick={(d) => goToMonth((d as unknown as Row).month)} className="cursor-pointer">
          {data.map((d) => (
            <Cell key={d.month} fillOpacity={d.month === selected ? 1 : 0.45} />
          ))}
        </Bar>
        <Bar dataKey="income" name="incomeBar" fill="var(--color-incomeBar)" radius={[6, 6, 0, 0]} maxBarSize={14}>
          {data.map((d) => (
            <Cell key={d.month} fillOpacity={d.month === selected ? 1 : 0.45} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
