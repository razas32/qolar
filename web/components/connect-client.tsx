"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Account, Me } from "@/lib/api";

type Result = { institution: string | null; accounts: string[]; transactions_added: number };

export function ConnectClient({ me, accounts }: { me: Me; accounts: Account[] }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Getting ready…");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [tg, setTg] = useState<Me>(me);
  const [tgBusy, setTgBusy] = useState(false);

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

  async function mintLinkCode() {
    setTgBusy(true);
    const r = await fetch("/api/proxy/me/telegram/link-code", { method: "POST" });
    if (r.ok) setTg(await r.json());
    setTgBusy(false);
  }

  async function unlinkTelegram() {
    setTgBusy(true);
    const r = await fetch("/api/proxy/me/telegram", { method: "DELETE" });
    if (r.ok) setTg(await r.json());
    setTgBusy(false);
  }

  const deepLink = tg.bot_username && tg.telegram_link_code ? `https://t.me/${tg.bot_username}?start=${tg.telegram_link_code}` : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect</h1>
        <p className="text-sm text-muted-foreground">Your bank, and the chat Qolar uses to ask you questions.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bank</CardTitle>
          <CardDescription>
            {accounts.length
              ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} connected. ${status}`
              : `Your login happens inside Plaid's secure window — it never touches Qolar. ${status}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.length > 0 && (
            <ul className="text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-1">
                  <span>{a.label}</span>
                  <span className="text-xs text-muted-foreground">{a.institution}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => open()} disabled={!ready || !linkToken || busy}>
              {accounts.length ? "Link another bank" : "Link a bank"}
            </Button>
            {accounts.length > 0 && (
              <Button variant="outline" onClick={syncNow} disabled={busy}>
                Sync now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linked {result.institution ?? "your bank"}</CardTitle>
            <CardDescription>
              {result.accounts.length} account{result.accounts.length === 1 ? "" : "s"} · {result.transactions_added}{" "}
              transactions pulled
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Telegram
            {tg.telegram_linked ? <Badge variant="secondary">connected</Badge> : <Badge variant="outline">not connected</Badge>}
          </CardTitle>
          <CardDescription>
            When Qolar can&apos;t tell what a transaction was, it asks you here — reply in your own words and it
            learns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tg.telegram_linked ? (
            <Button variant="outline" onClick={unlinkTelegram} disabled={tgBusy}>
              Disconnect
            </Button>
          ) : deepLink ? (
            <div className="space-y-2">
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Open Telegram and connect
              </a>
              <p className="text-xs text-muted-foreground">
                Opens a chat with @{tg.bot_username} and sends the connect code for you. Link expires in 15 minutes —
                refresh this page after tapping it.
              </p>
            </div>
          ) : (
            <Button onClick={mintLinkCode} disabled={tgBusy || !tg.bot_username}>
              Connect Telegram
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
