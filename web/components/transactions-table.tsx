"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkBar } from "@/components/bulk-bar";
import { CategoryPicker } from "@/components/category-picker";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { colorFor } from "@/lib/category-color";
import type { Category, Transaction } from "@/lib/api";
import { formatDate, isCredit, money, sourceLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TableProps = { transactions: Transaction[]; categories: Category[]; showAccount?: boolean; selectable?: boolean };

export function TransactionRow({
  t,
  categories,
  showAccount,
  selected,
  onToggle,
}: {
  t: Transaction;
  categories: Category[];
  showAccount: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const merchant = t.merchant_name ?? t.description ?? "Unknown merchant";
  return (
    <li className={cn("group flex items-center gap-3 px-4 py-3", t.nudge_pending && "bg-primary/5")}>
      {onToggle && (
        <Checkbox
          checked={!!selected}
          onCheckedChange={() => onToggle()}
          aria-label="Select transaction"
          className="md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:data-[checked]:opacity-100"
        />
      )}
      <MerchantAvatar name={merchant} color={colorFor(t.category, categories)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{merchant}</span>
          {t.pending && <Badge variant="outline" className="text-[10px]">pending</Badge>}
          {t.nudge_pending && <Badge variant="secondary" className="text-[10px]">asked on Telegram</Badge>}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {formatDate(t.date)}
          {showAccount && t.account ? ` · ${t.account}` : ""}
          {t.category_source ? ` · ${sourceLabel[t.category_source] ?? t.category_source}` : ""}
        </div>
      </div>
      <CategoryPicker transactionId={t.id} value={t.category} merchant={merchant} categories={categories} />
      <span className={cn("w-24 text-right tabular-nums", isCredit(t.amount) && "text-income")}>
        {isCredit(t.amount) ? "+" : ""}
        {money(t.amount)}
      </span>
    </li>
  );
}

export function TransactionsTable({ transactions, categories, showAccount = true, selectable = false }: TableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  const allSelected = transactions.length > 0 && transactions.every((t) => selected.has(t.id));
  if (transactions.length === 0) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Nothing here for this filter.</Card>;
  }
  return (
    <>
      <Card className="overflow-hidden p-0">
        {selectable && (
          <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(transactions.map((t) => t.id)))}
              aria-label="Select all"
            />
            Select all {transactions.length}
          </div>
        )}
        <ul className="divide-y divide-border">
          {transactions.map((t) => (
            <TransactionRow
              key={t.id}
              t={t}
              categories={categories}
              showAccount={showAccount}
              selected={selected.has(t.id)}
              onToggle={selectable ? () => toggle(t.id) : undefined}
            />
          ))}
        </ul>
      </Card>
      {selectable && <BulkBar ids={[...selected]} categories={categories} onDone={() => setSelected(new Set())} />}
    </>
  );
}
