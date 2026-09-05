import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Filters } from "@/components/filters";
import { SpendChart, type CategoryTotal } from "@/components/spend-chart";
import { TransactionsTable } from "@/components/transactions-table";
import { fetchAccounts, fetchCategories, fetchTransactions } from "@/lib/api";
import { requireUser } from "@/lib/require-user";
import { currentMonthKey, isCredit, money, monthKey } from "@/lib/format";

type Search = { month?: string; account?: string };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<Search> }) {
  await requireUser();
  const sp = await searchParams;
  const [all, accounts, categories] = await Promise.all([fetchTransactions(), fetchAccounts(), fetchCategories()]);

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Qolar</h1>
        <p className="text-muted-foreground">
          Connect a bank to get started. Your login happens inside Plaid&apos;s secure window — it never touches
          Qolar.
        </p>
        <Link href="/connect" className="inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
          Connect a bank
        </Link>
      </div>
    );
  }

  const months = [...new Set(all.map((t) => monthKey(t.date)))].sort();
  const month = sp.month ?? (months.includes(currentMonthKey()) ? currentMonthKey() : months.at(-1) ?? "all");
  const account = sp.account ?? "all";

  const rows = all.filter(
    (t) => (month === "all" || monthKey(t.date) === month) && (account === "all" || t.account_id === account),
  );

  const isTransfer = (c: string | null) => c === "Transfers";
  const spent = rows.filter((t) => !isCredit(t.amount) && !isTransfer(t.category)).reduce((s, t) => s + t.amount, 0);
  const cameIn = rows.filter((t) => isCredit(t.amount) && !isTransfer(t.category)).reduce((s, t) => s - t.amount, 0);
  const needsAttention = rows.filter((t) => t.is_ambiguous || !t.category).length;

  const byCategory = new Map<string, CategoryTotal>();
  for (const t of rows) {
    if (isCredit(t.amount) || isTransfer(t.category)) continue;
    const name = t.category ?? "Uncategorized";
    const cur = byCategory.get(name) ?? { name, spent: 0, count: 0 };
    cur.spent += t.amount;
    cur.count += 1;
    byCategory.set(name, cur);
  }
  const chart = [...byCategory.values()].sort((a, b) => b.spent - a.spent);

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (month !== "all") p.set("month", month);
    if (account !== "all") p.set("account", account);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} transactions · {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </p>
        </div>
        <Filters month={month} account={account} accounts={accounts} minMonth={months[0]} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Spent" value={money(spent)} hint="excludes transfers" />
        <Stat label="Came in" value={money(cameIn)} hint="excludes transfers" />
        <Link href={`/transactions${qs({ category: "__attention__" })}`}>
          <Stat label="Needs attention" value={String(needsAttention)} hint={needsAttention ? "click to review" : "all sorted"} />
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spend by category</CardTitle>
        </CardHeader>
        <CardContent>
          <SpendChart data={chart} linkBase={`/transactions${qs({})}`} />
        </CardContent>
      </Card>

      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Recent</h2>
        <Link href={`/transactions${qs({})}`} className="text-sm text-muted-foreground hover:underline">
          All transactions →
        </Link>
      </div>
      <TransactionsTable transactions={rows.slice(0, 10)} categories={categories} showAccount={account === "all"} />
    </div>
  );
}
