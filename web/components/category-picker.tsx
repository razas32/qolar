"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  transactionId: string;
  value: string | null;
  categories: { id: string; name: string }[];
  /** Compact trigger styling for table cells. */
  compact?: boolean;
};

const NONE = "__none__";

export function CategoryPicker({ transactionId, value, categories, compact }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onChange(name: string) {
    if (name === NONE || name === value) return;
    setError(null);
    const res = await fetch(`/api/proxy/plaid/transactions/${transactionId}/category`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: name }),
    });
    if (!res.ok) {
      setError("Couldn't save");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value ?? NONE} onValueChange={(v) => v && onChange(v)} disabled={pending}>
        <SelectTrigger
          size={compact ? "sm" : "default"}
          className={compact ? "h-7 min-w-[9rem] text-xs" : "min-w-[12rem]"}
          aria-label="Category"
        >
          <SelectValue placeholder="Uncategorized" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} disabled>
            Uncategorized
          </SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.name}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
