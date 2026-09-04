const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

export const money = (n: number) => cad.format(Math.abs(n));

/** Plaid convention: positive = money out, negative = money in. */
export const isCredit = (amount: number) => amount < 0;

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

/** "2026-09" */
export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}

export function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const sourceLabel: Record<string, string> = {
  user: "you",
  learned: "learned",
  plaid: "bank",
  llm: "auto",
  nudge: "you (Telegram)",
};
