"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Category } from "@/lib/api";

const NONE = "__none__";

export function CategoriesPanel({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string>(NONE);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  async function call(path: string, method: string, body?: unknown) {
    setError(null);
    const r = await fetch(`/api/proxy/${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const t = await r.json().catch(() => ({}));
      setError(t.detail ?? `Failed (${r.status})`);
      return false;
    }
    return true;
  }

  async function create() {
    if (!newName.trim()) return;
    if (await call("categories", "POST", { name: newName.trim() })) {
      setNewName("");
      refresh();
    }
  }

  async function rename(id: string) {
    if (!draft.trim()) return;
    if (await call(`categories/${id}`, "PUT", { name: draft.trim() })) {
      setEditing(null);
      refresh();
    }
  }

  async function remove(id: string) {
    const body = moveTo !== NONE ? { move_to: moveTo } : {};
    if (await call(`categories/${id}`, "DELETE", body)) {
      setDeleting(null);
      setMoveTo(NONE);
      refresh();
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category, e.g. Coffee" className="max-w-xs" />
        <Button type="submit" size="sm" disabled={!newName.trim()}>
          Add
        </Button>
        {error && <span className="self-center text-xs text-destructive">{error}</span>}
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[120px] text-right">Transactions</TableHead>
              <TableHead className="w-[260px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {editing === c.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename(c.id);
                      }}
                    >
                      <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8 max-w-xs" autoFocus />
                      <Button type="submit" size="sm">Save</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </form>
                  ) : (
                    c.name
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{c.transaction_count}</TableCell>
                <TableCell className="text-right">
                  {deleting === c.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <Select value={moveTo} onValueChange={(v) => setMoveTo(v ?? NONE)}>
                        <SelectTrigger size="sm" className="min-w-[10rem]">
                          <SelectValue placeholder="Move transactions to…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Leave uncategorized</SelectItem>
                          {categories.filter((o) => o.id !== c.id).map((o) => (
                            <SelectItem key={o.id} value={o.id}>Move to {o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="destructive" onClick={() => remove(c.id)}>Delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c.id); setDraft(c.name); }}>Rename</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(c.id)}>Delete</Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
