import "server-only";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";

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
  category_source: "user" | "learned" | "plaid" | "llm" | "nudge" | "matched" | null;
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

export type Category = { id: string; name: string; transaction_count: number; color_index: number };

export type SetCategoryResult = Transaction & { merchant_siblings: number; applied: number };

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

export type Me = {
  id: string;
  telegram_linked: boolean;
  telegram_link_code: string | null;
  bot_username: string | null;
};

export function apiBase(): string {
  const base = process.env.API_BASE_URL;
  if (!base) throw new Error("API_BASE_URL must be set");
  return base.replace(/\/$/, "");
}

/**
 * Server-only. Every call carries the signed-in user's Clerk session token;
 * the API verifies it against Clerk's JWKS and scopes everything to that user.
 * Callers must already have ensured the user is signed in (see requireUser()).
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error("not signed in");

  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
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

export const fetchTransactions = cache(() => apiFetch<Transaction[]>("/plaid/transactions"));
export const fetchAccounts = () => apiFetch<Account[]>("/plaid/accounts");
export const fetchCategories = cache(() => apiFetch<Category[]>("/categories"));
export const fetchRules = () => apiFetch<Rules>("/rules");
export const fetchMe = () => apiFetch<Me>("/me");
