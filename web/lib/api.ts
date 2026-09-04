import "server-only";

export type Transaction = {
  id: string;
  account_id: string | null;
  account: string | null;
  merchant_name: string | null;
  description: string | null;
  amount: number;
  date: string;
  pending: boolean;
  category: string | null;
  category_id: string | null;
  category_source: "user" | "learned" | "plaid" | "llm" | "nudge" | null;
  plaid_category: string | null;
  is_ambiguous: boolean;
  nudge_pending: boolean;
};

export type Account = {
  id: string;
  label: string;
  name: string;
  official_name: string | null;
  type: string | null;
  subtype: string | null;
  mask: string | null;
  institution: string | null;
  item_id: string;
};

export type Category = { id: string; name: string; transaction_count: number };

export type Rules = {
  overrides: {
    merchant: string;
    category: string | null;
    category_id: string | null;
    always_ask: boolean;
    source: "user" | "learned";
  }[];
  mappings: { plaid_code: string; primary: string | null; category: string | null; category_id: string | null }[];
  merchant_types: { merchant: string; plaid_code: string; confidence: string; source: string }[];
};

/**
 * Server-only: reads the Loonie API through the setup secret. Both env vars
 * stay on the server -- nothing here is ever shipped to the browser.
 */
function config() {
  const base = process.env.API_BASE_URL;
  const secret = process.env.SETUP_SECRET;
  if (!base || !secret) throw new Error("API_BASE_URL and SETUP_SECRET must be set");
  return { base: base.replace(/\/$/, ""), secret };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { base, secret } = config();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-Loonie-Setup-Secret": secret,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} on ${path}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const fetchTransactions = () => apiFetch<Transaction[]>("/plaid/transactions");
export const fetchAccounts = () => apiFetch<Account[]>("/plaid/accounts");
export const fetchCategories = () => apiFetch<Category[]>("/categories");
export const fetchRules = () => apiFetch<Rules>("/rules");
