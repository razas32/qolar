"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryChip } from "@/components/category-chip";
import type { Category, Rules } from "@/lib/api";

function pretty(code: string, primary: string | null) {
  const detail = primary && code !== primary ? code.slice(primary.length + 1) : code;
  return detail.toLowerCase().replace(/_/g, " ");
}

export function MappingsPanel({ mappings, categories }: { mappings: Rules["mappings"]; categories: Category[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function save(code: string, category: string) {
    setError(null);
    const r = await fetch(`/api/proxy/rules/mappings/${code}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (!r.ok) setError(`Couldn't update ${code}`);
    else startTransition(() => router.refresh());
  }

  // Group detailed codes under their primary so the list reads as a tree.
  const groups = new Map<string, Rules["mappings"]>();
  for (const m of mappings) {
    const key = m.primary ?? m.plaid_code;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your bank tags every transaction with one of these types. This decides which of <em>your</em> categories
        each type lands in. A specific type (e.g. &ldquo;groceries&rdquo;) wins over its group (&ldquo;food and
        drink&rdquo;).
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bank type</TableHead>
              <TableHead className="w-[240px]">Your category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...groups.entries()].map(([primary, rows]) =>
              rows
                .sort((a, b) => (a.plaid_code === primary ? -1 : b.plaid_code === primary ? 1 : a.plaid_code.localeCompare(b.plaid_code)))
                .map((m) => {
                  const isGroup = m.plaid_code === primary;
                  return (
                    <TableRow key={m.plaid_code}>
                      <TableCell className={isGroup ? "font-medium" : "pl-8 text-muted-foreground"}>
                        <span className="capitalize">{pretty(m.plaid_code, isGroup ? null : primary)}</span>
                      </TableCell>
                      <TableCell>
                        <Select value={m.category ?? ""} onValueChange={(v) => v && save(m.plaid_code, v)}>
                          <SelectTrigger size="sm" className="min-w-[12rem]">
                            <SelectValue placeholder={isGroup ? "Choose…" : "Same as group"}>
                              {m.category ? <CategoryChip name={m.category} categories={categories} /> : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.name}>
                                <CategoryChip name={c.name} categories={categories} />
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                }),
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
