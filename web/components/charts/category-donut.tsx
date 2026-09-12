"use client";

import Link from "next/link";
import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { colorFor } from "@/lib/category-color";
import { money } from "@/lib/format";
import { delta } from "@/lib/stats";
import { cn } from "@/lib/utils";

type Slice = { name: string; spent: number; count: number; share: number };
type Cat = { name: string; color_index: number };

export function CategoryDonut({ data, previous, categories, linkBase }: { data: Slice[]; previous: Slice[]; categories: Cat[]; linkBase: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.spent, 0);
  const prev = new Map(previous.map((p) => [p.name, p.spent]));
  const href = (name: string) => {
    const sep = linkBase.includes("?") ? "&" : "?";
    return `${linkBase}${sep}category=${encodeURIComponent(name === "Uncategorized" ? "__uncategorized__" : name)}`;
  };
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No spending in this period.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
      <div className="relative mx-auto h-44 w-44">
        <ChartContainer config={{}} className="h-44 w-44">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideIndicator formatter={(v) => money(Number(v))} />} />
            <Pie data={data} dataKey="spent" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} strokeWidth={0}
                 onMouseEnter={(_, i) => setHover(data[i].name)} onMouseLeave={() => setHover(null)}>
              {data.map((d) => (
                <Cell key={d.name} fill={colorFor(d.name, categories)} fillOpacity={hover && hover !== d.name ? 0.35 : 1} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Spent</span>
          <span className="text-lg font-semibold tabular-nums">{money(total)}</span>
        </div>
      </div>
      <ul className="divide-y divide-border text-sm">
        {data.map((d) => {
          const dl = delta(d.spent, prev.get(d.name) ?? 0);
          return (
            <li key={d.name} onMouseEnter={() => setHover(d.name)} onMouseLeave={() => setHover(null)}>
              <Link href={href(d.name)} className={cn("flex items-center gap-3 py-2 transition-opacity", hover && hover !== d.name && "opacity-50")}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorFor(d.name, categories) }} />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{Math.round(d.share * 100)}%</span>
                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{dl === null ? "" : `${dl > 0 ? "+" : ""}${dl}%`}</span>
                <span className="w-20 text-right tabular-nums">{money(d.spent)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
