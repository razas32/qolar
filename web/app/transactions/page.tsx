import { Filters } from "@/components/filters";
import { TransactionsTable } from "@/components/transactions-table";
import { fetchAccounts, fetchCategories, fetchTransactions } from "@/lib/api";
import { isCredit, money, monthKey } from "@/lib/format";

type Search = { month?: string; account?: string; category?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [all, accounts, categories] = await Promise.all([fetchTransactions(), fetchAccounts(), fetchCategories()]);

  const months = [...new Set(all.map((t) => monthKey(t.date)))].sort();
  const month = sp.month ?? "all";
  const account = sp.account ?? "all";
  const category = sp.category ?? "all";

  const rows = all.filter((t) => {
    if (month !== "all" && monthKey(t.date) !== month) return false;
    if (account !== "all" && t.account_id !== account) return false;
    if (category === "__uncategorized__") return !t.category;
    if (category === "__attention__") return t.is_ambiguous || !t.category || t.nudge_pending;
    if (category !== "all") return t.category === category;
    return true;
  });

  const out = rows.filter((t) => !isCredit(t.amount)).reduce((s, t) => s + t.amount, 0);
  const inn = rows.filter((t) => isCredit(t.amount)).reduce((s, t) => s - t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} shown · {money(out)} out · {money(inn)} in
          </p>
        </div>
        <Filters
          month={month}
          account={account}
          category={category}
          accounts={accounts}
          categories={categories}
          minMonth={months[0]}
        />
      </div>

      <TransactionsTable transactions={rows} categories={categories} showAccount={account === "all"} />

      <p className="text-xs text-muted-foreground">
        Changing a category here also teaches Qolar that merchant — it won&apos;t ask about it again.
      </p>
    </div>
  );
}
