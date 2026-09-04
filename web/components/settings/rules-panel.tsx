"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Category, Rules } from "@/lib/api";

const ASK = "__ask__";

type Props = {
  overrides: Rules["overrides"];
  merchantTypes: Rules["merchant_types"];
  categories: Category[];
};

export function RulesPanel({ overrides, merchantTypes, categories }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newMerchant, setNewMerchant] = useState("");
  const [newValue, setNewValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  async function save(merchant: string, value: string) {
    setError(null);
    const body = value === ASK ? { always_ask: true } : { category: value };
    const r = await fetch(`/api/proxy/rules/overrides/${encodeURIComponent(merchant)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      setError(`Couldn't save rule for ${merchant}`);
      return false;
    }
    refresh();
    return true;
  }

  async function remove(merchant: string) {
    setError(null);
    const r = await fetch(`/api/proxy/rules/overrides/${encodeURIComponent(merchant)}`, { method: "DELETE" });
    if (!r.ok) setError(`Couldn't delete rule for ${merchant}`);
    else refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          A merchant rule beats everything else. &ldquo;Always ask&rdquo; means Loonie will nudge you every time
          instead of guessing — right for Amazon-style merchants that could be anything.
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newMerchant.trim() || !newValue) return;
            if (await save(newMerchant.trim(), newValue)) {
              setNewMerchant("");
              setNewValue("");
            }
          }}
        >
          <Input value={newMerchant} onChange={(e) => setNewMerchant(e.target.value)} placeholder="Merchant, e.g. Amazon" className="max-w-xs" />
          <Select value={newValue} onValueChange={(v) => setNewValue(v ?? "")}>
            <SelectTrigger className="min-w-[12rem]">
              <SelectValue placeholder="Category or always ask" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ASK}>Always ask me</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" size="sm" disabled={!newMerchant.trim() || !newValue}>Add rule</Button>
          {error && <span className="self-center text-xs text-destructive">{error}</span>}
        </form>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead>Goes to</TableHead>
              <TableHead className="w-[110px]">Set by</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {overrides.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  No merchant rules yet. They appear here when you answer a nudge or change a category.
                </TableCell>
              </TableRow>
            )}
            {overrides.map((o) => (
              <TableRow key={o.merchant}>
                <TableCell className="font-medium capitalize">{o.merchant}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Select value={o.always_ask ? ASK : o.category ?? ""} onValueChange={(v) => v && save(o.merchant, v)}>
                      <SelectTrigger size="sm" className="min-w-[11rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ASK}>Always ask me</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch checked={o.always_ask} onCheckedChange={(on) => save(o.merchant, on ? ASK : o.category ?? categories[0]?.name ?? "")} />
                      ask
                    </label>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={o.source === "user" ? "secondary" : "outline"}>{o.source === "user" ? "you" : "learned"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(o.merchant)}>Remove</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          What Loonie knows about merchants ({merchantTypes.length}) — shared knowledge, not your rules
        </summary>
        <Card className="mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-[100px]">Confidence</TableHead>
                <TableHead className="w-[80px]">From</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {merchantTypes.map((m) => (
                <TableRow key={m.merchant}>
                  <TableCell className="capitalize">{m.merchant}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{m.plaid_code}</TableCell>
                  <TableCell className="text-xs">{m.confidence}</TableCell>
                  <TableCell className="text-xs">{m.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </details>
    </div>
  );
}
