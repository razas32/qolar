import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryPicker } from "@/components/category-picker";
import type { Transaction } from "@/lib/api";
import { formatDate, isCredit, money, sourceLabel } from "@/lib/format";

type Props = {
  transactions: Transaction[];
  categories: { id: string; name: string }[];
  showAccount?: boolean;
};

export function TransactionsTable({ transactions, categories, showAccount = true }: Props) {
  if (transactions.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">Nothing here for this filter.</Card>
    );
  }
  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[90px]">Date</TableHead>
            <TableHead>Merchant</TableHead>
            {showAccount && <TableHead className="hidden md:table-cell">Account</TableHead>}
            <TableHead>Category</TableHead>
            <TableHead className="hidden w-[110px] md:table-cell">Set by</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t) => (
            <TableRow key={t.id} className={t.nudge_pending ? "bg-amber-50/60 dark:bg-amber-900/10" : undefined}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(t.date)}</TableCell>
              <TableCell>
                <div className="font-medium">
                  {t.merchant_name ?? t.description ?? <span className="text-muted-foreground">Unknown merchant</span>}
                </div>
                {t.merchant_name && t.description && t.description !== t.merchant_name && (
                  <div className="text-xs text-muted-foreground">{t.description}</div>
                )}
                {t.pending && (
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    pending
                  </Badge>
                )}
              </TableCell>
              {showAccount && (
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{t.account ?? "—"}</TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-2">
                  <CategoryPicker transactionId={t.id} value={t.category} categories={categories} compact />
                  {t.nudge_pending && (
                    <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200">
                      asked on Telegram
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                {t.category_source ? sourceLabel[t.category_source] ?? t.category_source : "—"}
              </TableCell>
              <TableCell className={`text-right tabular-nums ${isCredit(t.amount) ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                {isCredit(t.amount) ? "+" : ""}
                {money(t.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
