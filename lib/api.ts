import "server-only";

export type Transaction = {
  id: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  category: string | null;
  is_ambiguous: boolean;
  nudge_pending: boolean;
};

/**
 * Server-only: reads the Loonie API through the setup secret. Both env vars
 * stay on the server -- nothing here is ever shipped to the browser.
 */
export async function fetchTransactions(): Promise<Transaction[]> {
  const base = process.env.API_BASE_URL;
  const secret = process.env.SETUP_SECRET;
  if (!base || !secret) {
    throw new Error("API_BASE_URL and SETUP_SECRET must be set");
  }

  const res = await fetch(`${base.replace(/\/$/, "")}/plaid/transactions`, {
    headers: { "X-Loonie-Setup-Secret": secret },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API responded ${res.status}`);
  }
  return res.json();
}
