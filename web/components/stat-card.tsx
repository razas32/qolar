import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  href?: string;
  tone?: "default" | "income";
  /** When true, an upward delta reads as good news (e.g. Income) instead of neutral/bad. */
  goodWhenUp?: boolean;
};

export function StatCard({ label, value, delta, hint, href, tone = "default", goodWhenUp = false }: Props) {
  const deltaIsGood = goodWhenUp ? delta !== undefined && delta !== null && delta > 0 : delta !== undefined && delta !== null && delta <= 0;
  const body = (
    <Card className={cn("h-full", href && "transition-colors hover:bg-accent/40")}>
      <CardContent className="flex h-full flex-col justify-between gap-2 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-3xl font-semibold tabular-nums", tone === "income" && "text-income")}>{value}</p>
        <p className="text-xs text-muted-foreground">
          {delta !== undefined && delta !== null ? (
            <span className={cn(deltaIsGood ? "text-income" : "text-foreground")}>
              {delta > 0 ? "+" : ""}
              {delta}% vs last month
            </span>
          ) : (
            hint ?? " "
          )}
        </p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
