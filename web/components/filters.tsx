"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { monthLabel, shiftMonth, currentMonthKey } from "@/lib/format";

const ALL = "__all__";

type Props = {
  month: string; // "2026-09" or "all"
  account: string; // plaid account id or "all"
  category?: string; // category name or "all" -- omit to hide the control
  accounts: { id: string; label: string }[];
  categories?: { id: string; name: string }[];
  /** Earliest month with data, so "previous" stops somewhere sensible. */
  minMonth?: string;
};

export function Filters({ month, account, category, accounts, categories, minMonth }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(next: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === ALL) p.delete(k);
      else p.set(k, v);
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  const isAll = month === "all";
  const atMin = !!minMonth && !isAll && month <= minMonth;
  const atNow = !isAll && month >= currentMonthKey();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => set({ month: shiftMonth(isAll ? currentMonthKey() : month, -1) })} disabled={atMin} aria-label="Previous month">
          ‹
        </Button>
        <Button variant={isAll ? "outline" : "secondary"} size="sm" className="min-w-[10rem]" onClick={() => set({ month: isAll ? currentMonthKey() : "all" })}>
          {isAll ? "All time" : monthLabel(month)}
        </Button>
        <Button variant="outline" size="sm" onClick={() => set({ month: shiftMonth(isAll ? currentMonthKey() : month, 1) })} disabled={atNow} aria-label="Next month">
          ›
        </Button>
        {!isAll && (
          <Button variant="ghost" size="sm" onClick={() => set({ month: "all" })}>
            All time
          </Button>
        )}
      </div>

      <Select value={account} onValueChange={(v) => set({ account: v })}>
        <SelectTrigger size="sm" className="min-w-[14rem]" aria-label="Account">
          <SelectValue placeholder="All accounts">
            {account === ALL ? "All accounts" : accounts.find((a) => a.id === account)?.label ?? "Account"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {category !== undefined && categories && (
        <Select value={category} onValueChange={(v) => set({ category: v })}>
          <SelectTrigger size="sm" className="min-w-[12rem]" aria-label="Category">
            <SelectValue placeholder="All categories">
              {category === ALL
                ? "All categories"
                : category === "__uncategorized__"
                  ? "Uncategorized"
                  : category === "__attention__"
                    ? "Needs attention"
                    : category}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            <SelectItem value="__uncategorized__">Uncategorized</SelectItem>
            <SelectItem value="__attention__">Needs attention</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
