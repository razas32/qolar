import { describe, expect, it } from "vitest";
import { byCategory, cumulativeByDay, delta, monthlyTotals, needsAttention, topMerchants, totals, type Txn } from "@/lib/stats";

const t = (o: Partial<Txn> & { amount: number; date: string }): Txn => ({
  id: Math.random().toString(36).slice(2),
  category: null,
  merchant_name: "Tim Hortons",
  description: null,
  account_id: "a",
  is_ambiguous: false,
  nudge_pending: false,
  ...o,
});

const rows: Txn[] = [
  t({ amount: 10, date: "2026-09-01", category: "Coffee" }),
  t({ amount: 30, date: "2026-09-03", category: "Groceries", merchant_name: "Metro" }),
  t({ amount: -1000, date: "2026-09-05", category: "Income", merchant_name: "Payroll" }),
  t({ amount: 500, date: "2026-09-06", category: "Transfers", merchant_name: "TD" }),
  t({ amount: 5, date: "2026-08-20", category: "Coffee" }),
];

describe("totals", () => {
  it("excludes transfers, splits income", () => {
    expect(totals(rows.filter((r) => r.date.startsWith("2026-09")))).toEqual({ spent: 40, income: 1000, net: 960 });
  });
});

describe("delta", () => {
  it("returns percent change or null", () => {
    expect(delta(110, 100)).toBe(10);
    expect(delta(50, 100)).toBe(-50);
    expect(delta(5, 0)).toBeNull();
  });
});

describe("monthlyTotals", () => {
  it("returns the last N months ending at endMonth, zero-filled", () => {
    const m = monthlyTotals(rows, "2026-09", 3);
    expect(m.map((x) => x.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(m[0]).toEqual({ month: "2026-07", spent: 0, income: 0 });
    expect(m[2]).toEqual({ month: "2026-09", spent: 40, income: 1000 });
  });
});

describe("byCategory", () => {
  it("sorts by spend desc with share of total", () => {
    const c = byCategory(rows.filter((r) => r.date.startsWith("2026-09")));
    expect(c.map((x) => x.name)).toEqual(["Groceries", "Coffee"]);
    expect(c[0].share).toBeCloseTo(0.75);
    expect(c[1].count).toBe(1);
  });
  it("labels missing category as Uncategorized", () => {
    expect(byCategory([t({ amount: 3, date: "2026-09-02" })])[0].name).toBe("Uncategorized");
  });
});

describe("cumulativeByDay", () => {
  it("runs a running sum across every day of the month", () => {
    const c = cumulativeByDay(rows, "2026-09");
    expect(c).toHaveLength(30);
    expect(c[0]).toEqual({ day: 1, value: 10 });
    expect(c[2]).toEqual({ day: 3, value: 40 });
    expect(c[29]).toEqual({ day: 30, value: 40 });
  });
});

describe("topMerchants", () => {
  it("groups by normalized merchant, spend only", () => {
    const m = topMerchants([...rows, t({ amount: 2, date: "2026-09-09", merchant_name: "tim  hortons", category: "Coffee" })], 2);
    expect(m[0]).toMatchObject({ name: "Metro", spent: 30, count: 1 });
    expect(m[1]).toMatchObject({ key: "tim hortons", spent: 17, count: 3, category: "Coffee" });
  });
});

describe("needsAttention", () => {
  it("flags uncategorized, ambiguous, or nudged", () => {
    expect(needsAttention(t({ amount: 1, date: "2026-09-01" }))).toBe(true);
    expect(needsAttention(t({ amount: 1, date: "2026-09-01", category: "Coffee", is_ambiguous: true }))).toBe(true);
    expect(needsAttention(t({ amount: 1, date: "2026-09-01", category: "Coffee" }))).toBe(false);
  });
});
