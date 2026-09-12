import type { SetCategoryResult } from "@/lib/api";

async function call<T>(path: string, method: "PUT" | "POST", body: unknown): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const setCategory = (id: string, category: string, applyToMerchant = false) =>
  call<SetCategoryResult>(`plaid/transactions/${id}/category`, "PUT", { category, apply_to_merchant: applyToMerchant });

export const bulkSetCategory = (ids: string[], category: string) =>
  call<{ updated: number }>("plaid/transactions/bulk-category", "POST", { transaction_ids: ids, category });
