"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { colorFor } from "@/lib/category-color";
import { bulkSetCategory } from "@/lib/client-api";

type Cat = { id: string; name: string; color_index: number };

export function BulkBar({ ids, categories, onDone }: { ids: string[]; categories: Cat[]; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  if (ids.length === 0) return null;

  async function apply(name: string) {
    setBusy(true);
    try {
      const r = await bulkSetCategory(ids, name);
      toast.success(`Set ${r.updated} to ${name}`);
      onDone();
      startTransition(() => router.refresh());
    } catch {
      toast.error("Couldn't update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-4 md:bottom-6 md:left-60">
      <div className="flex items-center gap-3 rounded-full border border-border bg-popover px-4 py-2 shadow-lg">
        <span className="text-sm tabular-nums">{ids.length} selected</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" disabled={busy}>Set category</Button>} />
          <DropdownMenuContent align="center" className="max-h-80 w-56 overflow-y-auto">
            {categories.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => apply(c.name)} className="gap-2">
                <span className="size-2 rounded-full" style={{ background: colorFor(c.name, categories) }} />
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          Clear
        </Button>
      </div>
    </div>
  );
}
