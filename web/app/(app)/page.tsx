import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Filters } from "@/components/filters";
import { StatCard } from "@/components/stat-card";
import { TrendChart } from "@/components/charts/trend-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CumulativeChart } from "@/components/charts/cumulative-chart";
import { TopMerchants } from "@/components/top-merchants";
import { TransactionsTable } from "@/components/transactions-table";
import { fetchAccounts, fetchCategories, fetchTransactions } from "@/lib/api";
import { requireUser } from "@/lib/require-user";
import { currentMonthKey, money, monthKey, monthLabel, shiftMonth } from "@/lib/format";
import { byCategory, cumulativeByDay, delta, monthlyTotals, needsAttention, totals } from "@/lib/stats";

type Search = { month?: string; account?: string };

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<Search> }) {
  await requireUser();
  const sp = await searchParams;
  const [all, accounts, categories] = await Promise.all([fetchTransactions(), fetchAccounts(), fetchCategories()]);

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Qolar</h1>
        <p className="text-muted-foreground">
          Connect a bank to get started. Your login happens inside Plaid&apos;s secure window and never touches Qolar.
        </p>
        <Link href="/connect" className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
          Connect a bank
        </Link>
      </div>
    );
  }

  const months = [...new Set(all.map((t) => monthKey(t.date)))].sort();
  const month = sp.month ?? (months.includes(currentMonthKey()) ? currentMonthKey() : months.at(-1) ?? currentMonthKey());
  const account = sp.account ?? "all";
  const scoped = all.filter((t) => account === "all" || t.account_id === account);
  const rows = scoped.filter((t) => monthKey(t.date) === month);
  const prevRows = scoped.filter((t) => monthKey(t.date) === shiftMonth(month, -1));

  const cur = totals(rows);
  const prev = totals(prevRows);
  const unsorted = rows.filter(needsAttention).length;
  const today = month === currentMonthKey() ? new Date().getDate() : undefined;

  const qs = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ month, ...(account !== "all" ? { account } : {}), ...extra });
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{monthLabel(month)}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} transactions · {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </p>
        </div>
        <Filters month={month} account={account} accounts={accounts} minMonth={months[0]} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Spent" value={money(cur.spent)} delta={delta(cur.spent, prev.spent)} />
        <StatCard label="Income" value={money(cur.income)} delta={delta(cur.income, prev.income)} tone="income" />
        <StatCard label="Net" value={`${cur.net < 0 ? "−" : ""}${money(cur.net)}`} hint="income minus spend" />
        <StatCard label="Unsorted" value={String(unsorted)} hint={unsorted ? "tap to review" : "all sorted"} href="/review" />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel title="Spend trend" className="lg:col-span-7">
          <TrendChart data={monthlyTotals(scoped, month, 6)} selected={month} />
        </Panel>
        <Panel title="By category" className="lg:col-span-5">
          <CategoryDonut data={byCategory(rows)} previous={byCategory(prevRows)} categories={categories} linkBase={`/transactions${qs()}`} />
        </Panel>
        <Panel title="Cumulative spend" className="lg:col-span-7">
          <CumulativeChart current={cumulativeByDay(rows, month)} previous={cumulativeByDay(prevRows, shiftMonth(month, -1))} today={today} />
        </Panel>
        <Panel title="Top merchants" className="lg:col-span-5">
          <TopMerchants rows={rows} categories={categories} />
        </Panel>
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Recent</h2>
        <Link href={`/transactions${qs()}`} className="text-sm text-muted-foreground hover:text-foreground">
          All transactions
        </Link>
      </div>
      <TransactionsTable transactions={rows.slice(0, 8)} categories={categories} showAccount={account === "all"} />
    </div>
  );
}
