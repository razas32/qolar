"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { askApplyToMerchant } from "@/components/apply-toast";
import { CategoryChip } from "@/components/category-chip";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Category, Transaction } from "@/lib/api";
import { colorFor } from "@/lib/category-color";
import { setCategory } from "@/lib/client-api";
import { formatDate, isCredit, money } from "@/lib/format";

const humanize = (code: string | null) => (code ? code.toLowerCase().replace(/_/g, " ") : null);

export function ReviewDeck({ queue, categories }: { queue: Transaction[]; categories: Category[] }) {
  const router = useRouter();
  const [items, setItems] = useState(queue);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const current = items[index] as Transaction | undefined;
  const total = queue.length;

  const visible = useMemo(
    () => (query ? categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())) : categories),
    [categories, query],
  );

  const pick = useCallback(
    async (name: string) => {
      if (!current || busy) return;
      setBusy(true);
      const merchant = current.merchant_name ?? current.description ?? "this merchant";
      try {
        const r = await setCategory(current.id, name);
        setItems((list) =>
          list.map((t) =>
            t.id === current.id
              ? { ...t, category: name, category_source: "user", is_ambiguous: false, nudge_pending: false }
              : t,
          ),
        );
        setIndex((i) => i + 1);
        setQuery("");
        askApplyToMerchant({
          transactionId: current.id,
          category: name,
          merchant,
          siblings: r.merchant_siblings,
          merchantKey: r.merchant_key,
          onApplied: () => router.refresh(),
        });
        router.refresh();
      } catch {
        toast.error("Couldn't save");
      } finally {
        setBusy(false);
      }
    },
    [current, busy, router],
  );

  const skip = useCallback(() => {
    if (busy) return;
    setItems((list) => list.filter((_, i) => i !== index));
    setQuery("");
  }, [busy, index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!current) return;
      const typing = document.activeElement === search.current;
      if (e.key === "/" && !typing) { e.preventDefault(); search.current?.focus(); return; }
      if (typing) { if (e.key === "Escape") search.current?.blur(); return; }
      if (e.key >= "1" && e.key <= "9") { const c = visible[Number(e.key) - 1]; if (c) pick(c.name); }
      else if (e.key.toLowerCase() === "s") skip();
      else if (e.key.toLowerCase() === "t") pick("Transfers");
      else if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, visible, pick, skip, index]);

  if (!current) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-income/15 text-income"><Check className="size-6" /></span>
          <p className="text-lg font-medium">All sorted</p>
          <p className="text-sm text-muted-foreground">{total ? `${total} reviewed.` : "Nothing needed your attention."}</p>
          <Button render={<Link href="/">Back to overview</Link>} />
        </CardContent>
      </Card>
    );
  }

  const t = current;
  const merchant = t.merchant_name ?? t.description ?? "Unknown merchant";
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground tabular-nums">{index + 1} of {items.length}</p>
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start gap-4">
            <MerchantAvatar name={merchant} color={colorFor(t.category, categories)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-semibold">{merchant}</p>
              {t.description && t.description !== t.merchant_name && <p className="truncate text-sm text-muted-foreground">{t.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(t.date)}{t.account ? ` · ${t.account}` : ""}{t.plaid_category ? ` · bank says ${humanize(t.plaid_category)}` : ""}
              </p>
            </div>
            <p className={`text-2xl font-semibold tabular-nums ${isCredit(t.amount) ? "text-income" : ""}`}>
              {isCredit(t.amount) ? "+" : ""}{money(t.amount)}
            </p>
          </div>
          {t.category && (
            <p className="text-sm text-muted-foreground">Current guess: <CategoryChip name={t.category} categories={categories} /></p>
          )}
          <Input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories  ( / )" className="h-9" />
          <div className="flex flex-wrap gap-2">
            {visible.map((c, i) => (
              <CategoryChip key={c.id} name={c.name} categories={categories} size="md" onClick={() => pick(c.name)}
                hint={i < 9 ? String(i + 1) : undefined} className={i < 9 ? "pl-2" : undefined} disabled={busy} />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span>1–9 pick · T transfer · S skip · ← back</span>
            <Button variant="ghost" size="sm" onClick={skip} disabled={busy}>Skip</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
