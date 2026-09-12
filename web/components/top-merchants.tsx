import { colorFor } from "@/lib/category-color";
import { money } from "@/lib/format";
import { topMerchants, type Txn } from "@/lib/stats";

type Cat = { name: string; color_index: number };

export function TopMerchants({ rows, categories }: { rows: Txn[]; categories: Cat[] }) {
  const top = topMerchants(rows, 5);
  if (top.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  const max = top[0].spent;
  return (
    <ul className="space-y-3 text-sm">
      {top.map((m) => (
        <li key={m.key} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: colorFor(m.category, categories) }} />
            <span className="flex-1 truncate">{m.name}</span>
            <span className="text-xs text-muted-foreground">{m.count}×</span>
            <span className="w-20 text-right tabular-nums">{money(m.spent)}</span>
          </div>
          <div className="h-1 rounded-full bg-muted">
            <div className="h-1 rounded-full" style={{ width: `${(m.spent / max) * 100}%`, background: colorFor(m.category, categories) }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
