"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CategoryPicker } from "@/components/category-picker";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { colorFor } from "@/lib/category-color";
import type { Category, Transaction } from "@/lib/api";
import { formatDate, isCredit, money, sourceLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TableProps = { transactions: Transaction[]; categories: Category[]; showAccount?: boolean };

export function TransactionRow({ t, categories, showAccount }: { t: Transaction; categories: Category[]; showAccount: boolean }) {
  const merchant = t.merchant_name ?? t.description ?? "Unknown merchant";
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", t.nudge_pending && "bg-primary/5")}>
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

export function TransactionsTable({ transactions, categories, showAccount = true }: TableProps) {
  if (transactions.length === 0) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Nothing here for this filter.</Card>;
  }
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-border">
        {transactions.map((t) => (
          <TransactionRow key={t.id} t={t} categories={categories} showAccount={showAccount} />
        ))}
      </ul>
    </Card>
  );
}
