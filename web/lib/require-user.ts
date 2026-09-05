import "server-only";
import { auth } from "@clerk/nextjs/server";

/**
 * Per Clerk's current guidance, protection lives at the resource, not in
 * middleware. Call at the top of every page that shows user data.
 */
export async function requireUser() {
  const session = await auth();
  if (!session.isAuthenticated) {
    return session.redirectToSignIn();
  }
  return session;
}
