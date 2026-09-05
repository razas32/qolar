import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { apiBase } from "@/lib/api";

/**
 * Browser -> Qolar API, carrying the signed-in user's Clerk session token.
 * Only the paths the dashboard actually uses are forwarded; everything else
 * is 404. The API scopes every one of these to the token's user.
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
  { method: "POST", pattern: /^me\/telegram\/link-code$/ },
  { method: "DELETE", pattern: /^me\/telegram$/ },
];

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.map(decodeURIComponent).join("/");
  const allowed = ALLOW.some((r) => r.method === req.method && r.pattern.test(joined));
  if (!allowed) return NextResponse.json({ detail: "not allowed" }, { status: 404 });

  const { getToken, isAuthenticated } = await auth();
  const token = isAuthenticated ? await getToken() : null;
  if (!token) return NextResponse.json({ detail: "sign in required" }, { status: 401 });

  const body = req.method === "GET" ? undefined : await req.text();
  const upstream = await fetch(`${apiBase()}/${path.map(encodeURIComponent).join("/")}`, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
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
