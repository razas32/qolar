import { NextResponse, type NextRequest } from "next/server";

/**
 * Browser -> Loonie API, with the setup secret added server-side. Only the
 * paths the dashboard actually uses are forwarded; everything else is 404.
 * proxy.ts (Basic Auth) already gates this route like every other.
 */

const ALLOW: { method: string; pattern: RegExp }[] = [
  { method: "PUT", pattern: /^plaid\/transactions\/[0-9a-f-]{36}\/category$/ },
  { method: "POST", pattern: /^plaid\/link-token$/ },
  { method: "POST", pattern: /^plaid\/exchange-token$/ },
  { method: "POST", pattern: /^plaid\/sync$/ },
  { method: "POST", pattern: /^categories$/ },
  { method: "PUT", pattern: /^categories\/[0-9a-f-]{36}$/ },
  { method: "DELETE", pattern: /^categories\/[0-9a-f-]{36}$/ },
  { method: "PUT", pattern: /^rules\/overrides\/[^/]+$/ },
  { method: "DELETE", pattern: /^rules\/overrides\/[^/]+$/ },
  { method: "PUT", pattern: /^rules\/mappings\/[A-Z_]+$/ },
  { method: "POST", pattern: /^recategorize$/ },
];

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.map(decodeURIComponent).join("/");
  const allowed = ALLOW.some((r) => r.method === req.method && r.pattern.test(joined));
  if (!allowed) return NextResponse.json({ detail: "not allowed" }, { status: 404 });

  const base = process.env.API_BASE_URL?.replace(/\/$/, "");
  const secret = process.env.SETUP_SECRET;
  if (!base || !secret) return NextResponse.json({ detail: "API not configured" }, { status: 503 });

  const body = req.method === "GET" ? undefined : await req.text();
  const upstream = await fetch(`${base}/${path.map(encodeURIComponent).join("/")}`, {
    method: req.method,
    headers: {
      "X-Loonie-Setup-Secret": secret,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body || undefined,
    cache: "no-store",
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export { forward as POST, forward as PUT, forward as DELETE };
