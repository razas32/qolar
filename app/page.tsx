import { fetchTransactions, type Transaction } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CategoryBadge({ t }: { t: Transaction }) {
  if (t.nudge_pending) {
    return (
      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200">
        Awaiting reply
      </Badge>
    );
  }
  if (t.category) {
    return <Badge variant="secondary">{t.category}</Badge>;
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Uncategorized
    </Badge>
  );
}

export default async function Home() {
  const transactions = await fetchTransactions();

  // Plaid convention: positive = money out, negative = refund/credit.
  const spent = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const categorized = transactions.filter((t) => t.category).length;
  const pending = transactions.filter((t) => t.nudge_pending).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Loonie</h1>
          <p className="text-sm text-muted-foreground">
            {transactions.length} transactions synced
          </p>
        </div>
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{cad.format(spent)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Categorized
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {categorized}
              <span className="text-base font-normal text-muted-foreground">
                {" "}/ {transactions.length}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Awaiting your reply
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{pending}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Date</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-muted-foreground">
                  {formatDate(t.date)}
                </TableCell>
                <TableCell className="font-medium">
                  {t.merchant_name ?? (
                    <span className="text-muted-foreground">Unknown merchant</span>
                  )}
                </TableCell>
                <TableCell>
                  <CategoryBadge t={t} />
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    t.amount < 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                  }`}
                >
                  {t.amount < 0 ? "+" : ""}
                  {cad.format(Math.abs(t.amount))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
