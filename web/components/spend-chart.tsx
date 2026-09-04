"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { money } from "@/lib/format";

export type CategoryTotal = { name: string; spent: number; count: number };

const config = {
  spent: { label: "Spent", color: "var(--chart-1)" },
} satisfies ChartConfig;

/**
 * One series (spend), one hue, magnitude by bar length, direct labels.
 * Horizontal so category names read naturally at any count.
 */
/** linkBase: e.g. "/transactions?month=2026-09" -- the category param is appended here. */
export function SpendChart({ data, linkBase }: { data: CategoryTotal[]; linkBase: string }) {
  const href = (name: string) => {
    const sep = linkBase.includes("?") ? "&" : "?";
    const value = name === "Uncategorized" ? "__uncategorized__" : name;
    return `${linkBase}${sep}category=${encodeURIComponent(value)}`;
  };
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No spending in this period.</p>;
  }
  const height = Math.max(160, data.length * 36 + 24);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
      <ChartContainer config={config} style={{ height }} className="w-full">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)" }}
            content={<ChartTooltipContent formatter={(v) => money(Number(v))} />}
          />
          <Bar dataKey="spent" fill="var(--color-spent)" radius={[0, 4, 4, 0]} maxBarSize={22}>
            <LabelList
              dataKey="spent"
              position="right"
              className="fill-foreground"
              fontSize={12}
              formatter={(v: unknown) => money(Number(v))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>

      <ul className="divide-y text-sm">
        {data.map((d) => (
          <li key={d.name}>
            <Link href={href(d.name)} className="flex items-center justify-between py-2 hover:underline">
              <span>
                {d.name}
                <span className="ml-2 text-xs text-muted-foreground">{d.count}</span>
              </span>
              <span className="tabular-nums">{money(d.spent)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
