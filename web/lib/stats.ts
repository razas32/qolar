import type { Transaction } from "@/lib/api";
import { monthKey, shiftMonth } from "@/lib/format";

export type Txn = Pick<
  Transaction,
  "id" | "amount" | "date" | "category" | "merchant_name" | "description" | "account_id" | "is_ambiguous" | "nudge_pending"
>;

export const isTransfer = (c: string | null) => c === "Transfers";
export const needsAttention = (t: Txn) => !t.category || t.is_ambiguous || t.nudge_pending;

/** Mirrors the API's merchant_key(): trim, collapse whitespace, lowercase. */
export const normalizeMerchant = (name: string | null, description: string | null) =>
  (name || description || "").trim().replace(/\s+/g, " ").toLowerCase();

const round2 = (n: number) => Math.round(n * 100) / 100;

export function totals(rows: Txn[]) {
  let spent = 0;
  let income = 0;
  for (const t of rows) {
    if (isTransfer(t.category)) continue;
    if (t.amount > 0) spent += t.amount;
    else income -= t.amount;
  }
  return { spent: round2(spent), income: round2(income), net: round2(income - spent) };
}

export function delta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function monthlyTotals(all: Txn[], endMonth: string, count = 6) {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) months.push(shiftMonth(endMonth, -i));
  return months.map((month) => {
    const { spent, income } = totals(all.filter((t) => monthKey(t.date) === month));
    return { month, spent, income };
  });
}

export function byCategory(rows: Txn[]) {
  const acc = new Map<string, { name: string; spent: number; count: number }>();
  let total = 0;
  for (const t of rows) {
    if (t.amount <= 0 || isTransfer(t.category)) continue;
    const name = t.category ?? "Uncategorized";
    const cur = acc.get(name) ?? { name, spent: 0, count: 0 };
    cur.spent += t.amount;
    cur.count += 1;
    total += t.amount;
    acc.set(name, cur);
  }
  return [...acc.values()]
    .map((c) => ({ ...c, spent: round2(c.spent), share: total ? c.spent / total : 0 }))
    .sort((a, b) => b.spent - a.spent);
}

export function cumulativeByDay(rows: Txn[], month: string) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const perDay = new Array<number>(days + 1).fill(0);
  for (const t of rows) {
    if (monthKey(t.date) !== month || t.amount <= 0 || isTransfer(t.category)) continue;
    perDay[Number(t.date.slice(8, 10))] += t.amount;
  }
  const out: { day: number; value: number }[] = [];
  let run = 0;
  for (let d = 1; d <= days; d++) {
    run += perDay[d];
    out.push({ day: d, value: round2(run) });
  }
  return out;
}

export function topMerchants(rows: Txn[], n = 5) {
  const acc = new Map<string, { key: string; name: string; count: number; spent: number; category: string | null }>();
  for (const t of rows) {
    if (t.amount <= 0 || isTransfer(t.category)) continue;
    const key = normalizeMerchant(t.merchant_name, t.description);
    if (!key) continue;
    const cur = acc.get(key) ?? { key, name: t.merchant_name || t.description || key, count: 0, spent: 0, category: t.category };
    cur.count += 1;
    cur.spent += t.amount;
    if (!cur.category && t.category) cur.category = t.category;
    acc.set(key, cur);
  }
  return [...acc.values()]
    .map((m) => ({ ...m, spent: round2(m.spent) }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, n);
}
