"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CategoryChip } from "@/components/category-chip";
import { askApplyToMerchant } from "@/components/apply-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { colorFor } from "@/lib/category-color";
import { setCategory } from "@/lib/client-api";

type Cat = { id: string; name: string; color_index: number };
type Props = { transactionId: string; value: string | null; merchant: string; categories: Cat[] };

export function CategoryPicker({ transactionId, value, merchant, categories }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  async function pick(name: string) {
    setOpen(false);
    if (name === value) return;
    try {
      const r = await setCategory(transactionId, name);
      startTransition(() => router.refresh());
      askApplyToMerchant({ transactionId, category: name, merchant, siblings: r.merchant_siblings, onApplied: () => router.refresh() });
    } catch {
      toast.error("Couldn't save category");
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger disabled={pending} render={<CategoryChip name={value} categories={categories} onClick={() => setOpen(true)} />} />
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        {categories.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => pick(c.name)} className="gap-2">
            <span className="size-2 rounded-full" style={{ background: colorFor(c.name, categories) }} />
            {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
