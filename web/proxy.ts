import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth gate for the whole dashboard. Vercel gives every deploy a
 * public URL by default, and this page shows real bank transactions -- so
 * nothing renders until the browser sends the right username/password.
 */

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;

  // Fail closed: if the gate isn't configured, refuse to serve anything.
  if (!user || !pass) {
    return new NextResponse("Dashboard auth not configured", { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const idx = decoded.indexOf(":");
    const givenUser = decoded.slice(0, idx);
    const givenPass = decoded.slice(idx + 1);
    if (constantTimeEqual(givenUser, user) && constantTimeEqual(givenPass, pass)) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Loonie", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
