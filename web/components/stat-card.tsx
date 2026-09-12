import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = { label: string; value: string; delta?: number | null; hint?: string; href?: string; tone?: "default" | "income" };

export function StatCard({ label, value, delta, hint, href, tone = "default" }: Props) {
  const body = (
    <Card className={cn("h-full", href && "transition-colors hover:bg-accent/40")}>
      <CardContent className="flex h-full flex-col justify-between gap-2 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-3xl font-semibold tabular-nums", tone === "income" && "text-income")}>{value}</p>
        <p className="text-xs text-muted-foreground">
          {delta !== undefined && delta !== null ? (
            <span className={cn(delta > 0 ? "text-foreground" : "text-income")}>
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
