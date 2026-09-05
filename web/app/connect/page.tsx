"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Result = { institution: string | null; accounts: string[]; transactions_added: number };

export default function ConnectPage() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Getting ready…");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/proxy/plaid/link-token", { method: "POST" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((d: { link_token: string }) => {
        if (!cancelled) {
          setLinkToken(d.link_token);
          setStatus("Ready");
        }
      })
      .catch((e) => !cancelled && setStatus(`Couldn't start Plaid Link: ${String(e).slice(0, 120)}`));
    return () => {
      cancelled = true;
    };
  }, []);

  const onSuccess = useCallback(
    async (public_token: string | null) => {
      if (!public_token) return;
      setBusy(true);
      setStatus("Linking account and pulling transactions…");
      const r = await fetch("/api/proxy/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token }),
      });
      if (!r.ok) {
        setStatus(`Exchange failed: ${(await r.text()).slice(0, 160)}`);
        setBusy(false);
        return;
      }
      const d: Result = await r.json();
      setResult(d);
      setStatus("Done");
      setBusy(false);
      router.refresh();
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
    onExit: (err) => {
      if (err) setStatus(`Plaid Link closed: ${err.display_message ?? err.error_code ?? "error"}`);
    },
  });

  async function syncNow() {
    setBusy(true);
    setStatus("Syncing…");
    const r = await fetch("/api/proxy/plaid/sync", { method: "POST" });
    const d = await r.json().catch(() => []);
    const added = Array.isArray(d) ? d.reduce((s: number, x: { added: number }) => s + (x.added ?? 0), 0) : 0;
    setStatus(`Synced — ${added} new transaction${added === 1 ? "" : "s"}`);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect a card</h1>
        <p className="text-sm text-muted-foreground">
          Your bank login happens inside Plaid&apos;s secure window — it never touches Qolar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link a bank</CardTitle>
          <CardDescription>{status}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => open()} disabled={!ready || !linkToken || busy}>
            Open Plaid Link
          </Button>
          <Button variant="outline" onClick={syncNow} disabled={busy}>
            Sync now
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linked {result.institution ?? "your bank"}</CardTitle>
            <CardDescription>
              {result.accounts.length} account{result.accounts.length === 1 ? "" : "s"} · {result.transactions_added} transactions
              pulled
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm">
              {result.accounts.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
