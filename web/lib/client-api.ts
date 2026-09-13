import type { SetCategoryResult } from "@/lib/api";

async function call<T>(path: string, method: "PUT" | "POST", body: unknown): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const setCategory = (id: string, category: string, applyToMerchant = false) =>
  call<SetCategoryResult>(`plaid/transactions/${id}/category`, "PUT", { category, apply_to_merchant: applyToMerchant });

const BULK_CHUNK_SIZE = 500;

export async function bulkSetCategory(ids: string[], category: string): Promise<{ updated: number }> {
  let updated = 0;
  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
    const res = await call<{ updated: number }>("plaid/transactions/bulk-category", "POST", {
      transaction_ids: chunk,
      category,
    });
    updated += res.updated;
  }
  return { updated };
}
