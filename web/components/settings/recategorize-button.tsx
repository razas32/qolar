"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Result = { total: number; re_evaluated: number; needs_nudge: number };

export function RecategorizeButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/proxy/recategorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ send_nudges: false }),
    });
    if (!r.ok) {
      setMsg("Failed");
      setBusy(false);
      return;
    }
    const d: Result = await r.json();
    setMsg(`Re-evaluated ${d.re_evaluated} of ${d.total} · ${d.needs_nudge} still unknown`);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button variant="outline" size="sm" onClick={run} disabled={busy || pending}>
        {busy ? "Running…" : "Re-run categorization"}
      </Button>
    </div>
  );
}
