import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk session handling for every route (pages and /api). Per Clerk's current
 * guidance, routes aren't blocked here -- each page / route handler calls
 * `await auth()` and redirects or 401s itself. This just makes the session
 * available and refreshes it.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
